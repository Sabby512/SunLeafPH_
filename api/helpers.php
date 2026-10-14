<?php
declare(strict_types=1);

/* ------------------------------------------------------------------ config -- */
function cfg(?string $key = null): mixed
{
    static $c = null;
    if ($c === null) {
        $c = require __DIR__ . '/config.php';
    }
    return $key === null ? $c : ($c[$key] ?? null);
}

/* ---------------------------------------------------------------- responses -- */
/** An error we want to show the visitor (wrong password, missing field ...). */
final class ApiError extends Exception
{
    public function __construct(string $message, public int $status = 400, public ?string $field = null)
    {
        parent::__construct($message);
    }
}

function send(array $data, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

/** Reads the JSON body of a POST request. */
function body(): array
{
    $raw = file_get_contents('php://input', false, null, 0, 65537);
    if ($raw === false || $raw === '') {
        return [];
    }
    if (strlen($raw) > 65536) {
        throw new ApiError('That request is too large.', 413);
    }
    $j = json_decode($raw, true);
    if (!is_array($j)) {
        throw new ApiError('Invalid request.', 400);
    }
    return $j;
}

/** Basic cross-site protection for POST requests (together with SameSite cookies). */
function guard_post(): void
{
    $type = strtolower($_SERVER['CONTENT_TYPE'] ?? '');
    if (!str_contains($type, 'application/json')) {
        throw new ApiError('Unsupported request type.', 415);
    }
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($origin !== '' && $origin !== 'null') {
        $oh = parse_url($origin, PHP_URL_HOST) . ((($p = parse_url($origin, PHP_URL_PORT)) ? ':' . $p : ''));
        $host = $_SERVER['HTTP_HOST'] ?? '';
        if (strcasecmp($oh, $host) !== 0) {
            throw new ApiError('Cross-site requests are not allowed.', 403);
        }
    }
}

/* --------------------------------------------------------------- validation -- */
function clean_text(mixed $v, int $max): string
{
    if (is_array($v) || is_object($v)) {
        return '';
    }
    $s = trim((string) $v);
    $s = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $s) ?? '';   // strip control characters
    return mb_substr($s, 0, $max);
}

/** Text field. $min > 0 makes it required. */
function field(array $b, string $key, int $max, int $min = 0, ?string $msg = null): string
{
    $s = clean_text($b[$key] ?? '', $max);
    if (mb_strlen($s) < $min) {
        throw new ApiError($msg ?? 'Please fill in all required fields.', 422, $key);
    }
    return $s;
}

function email_field(array $b, string $key = 'email'): string
{
    $e = strtolower(clean_text($b[$key] ?? '', 190));
    if ($e === '' || !filter_var($e, FILTER_VALIDATE_EMAIL)) {
        throw new ApiError('Enter a valid email address.', 422, $key);
    }
    return $e;
}

/** A list of short strings (checkbox groups), returned as "a, b, c". */
function list_field(array $b, string $key, int $each, int $maxItems, int $maxLen): string
{
    $v = $b[$key] ?? [];
    if (is_string($v)) {
        $v = explode(',', $v);
    }
    if (!is_array($v)) {
        return '';
    }
    $out = [];
    foreach (array_slice($v, 0, $maxItems) as $item) {
        $t = clean_text($item, $each);
        if ($t !== '') {
            $out[] = $t;
        }
    }
    return mb_substr(implode(', ', $out), 0, $maxLen);
}

function password_field(array $b, string $key): string
{
    $p = (string) ($b[$key] ?? '');
    if (strlen($p) < 8) {
        throw new ApiError('Password must be at least 8 characters.', 422, 'pw');
    }
    if (strlen($p) > 72) {                      // bcrypt only uses the first 72 bytes
        throw new ApiError('Password is too long (72 characters at most).', 422, 'pw');
    }
    return $p;
}

/* --------------------------------------------------------------------- time -- */
function iso(?string $utc): ?string
{
    return $utc ? str_replace(' ', 'T', $utc) . 'Z' : null;
}

function client_ip(): string
{
    return $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
}

function is_local_request(): bool
{
    return in_array(client_ip(), ['127.0.0.1', '::1'], true);
}

/* ------------------------------------------------------------- rate limiting -- */
function rate_count(string $bucket, string $ident, int $windowSec): int
{
    $st = db()->prepare(
        'SELECT COUNT(*) FROM rate_limits
         WHERE bucket = ? AND ident = ? AND created_at > DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? SECOND)'
    );
    $st->execute([$bucket, $ident, $windowSec]);
    return (int) $st->fetchColumn();
}

function rate_hit(string $bucket, string $ident): void
{
    db()->prepare('INSERT INTO rate_limits (bucket, ident, created_at) VALUES (?, ?, UTC_TIMESTAMP())')
        ->execute([$bucket, mb_substr($ident, 0, 100)]);
    if (random_int(1, 100) === 1) {              // tidy old rows now and then
        db()->exec('DELETE FROM rate_limits WHERE created_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 2 DAY)');
        db()->exec('DELETE FROM sessions WHERE expires_at < UTC_TIMESTAMP()');
    }
}

/** Counts this request and refuses it when the visitor is over the limit. */
function throttle(string $bucket, string $ident, int $max, int $windowSec): void
{
    if (rate_count($bucket, $ident, $windowSec) >= $max) {
        throw new ApiError('Too many requests. Please wait a little and try again.', 429);
    }
    rate_hit($bucket, $ident);
}

/* ----------------------------------------------------------------- sessions -- */
const SESSION_COOKIE = 'ce_sid';

function session_handler(): DbSessions
{
    static $h = null;
    return $h ??= new DbSessions();
}

function cookie_opts(int $expires = 0): array
{
    $dir = rtrim(str_replace('\\', '/', dirname(dirname($_SERVER['SCRIPT_NAME'] ?? '/api/index.php'))), '/');
    return [
        'expires'  => $expires,
        'path'     => ($dir === '' ? '/' : $dir . '/'),
        'secure'   => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
        'httponly' => true,               // JavaScript can't read the login cookie
        'samesite' => 'Lax',
    ];
}

/** Starts the session only when needed (a cookie exists, or we are logging someone in). */
function session_boot(bool $create = false): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    if (!$create && empty($_COOKIE[SESSION_COOKIE])) {
        return;
    }
    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_cookies', '1');
    session_name(SESSION_COOKIE);
    $o = cookie_opts();
    session_set_cookie_params(['lifetime' => 0] + array_diff_key($o, ['expires' => 1]));
    session_set_save_handler(session_handler(), true);
    session_start();
}

function current_user(): ?array
{
    static $cache = [false, null];
    session_boot(false);
    if (session_status() !== PHP_SESSION_ACTIVE || empty($_SESSION['uid'])) {
        return null;
    }
    if ($cache[0] === $_SESSION['uid']) {
        return $cache[1];
    }
    $st = db()->prepare('SELECT * FROM users WHERE id = ?');
    $st->execute([(int) $_SESSION['uid']]);
    $u = $st->fetch() ?: null;
    $cache = [$_SESSION['uid'], $u];
    return $u;
}

function require_user(): array
{
    return current_user() ?? throw new ApiError('Please log in first.', 401);
}

function require_admin(): array
{
    $u = require_user();
    if ($u['role'] !== 'admin') {
        throw new ApiError('Admins only.', 403);
    }
    return $u;
}

function start_login(array $user, bool $remember): void
{
    session_boot(true);
    session_regenerate_id(true);                   // new id on every login (prevents session fixation)
    $_SESSION['uid'] = (int) $user['id'];
    session_handler()->life = $remember ? 30 * 86400 : 8 * 3600;
    if ($remember) {                                // keep the cookie after the browser closes
        setcookie(SESSION_COOKIE, session_id(), cookie_opts(time() + 30 * 86400));
    }
}

function end_session(): void
{
    session_boot(false);
    if (session_status() === PHP_SESSION_ACTIVE) {
        $_SESSION = [];
        session_destroy();
    }
    setcookie(SESSION_COOKIE, '', cookie_opts(time() - 3600));
}

function public_user(array $u): array
{
    return ['name' => $u['name'], 'email' => $u['email'], 'role' => $u['role'], 'created' => iso($u['created_at'])];
}
