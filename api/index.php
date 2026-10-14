<?php
declare(strict_types=1);

/**
 * Clean Energy - REST API (PHP + MySQL).
 * The website calls it as  api/index.php/<route>   e.g.  api/index.php/auth/login
 * Open  http://localhost/clean-energy/api/index.php/ping  in a browser to check it is alive.
 */

ini_set('display_errors', '0');          // never print PHP errors into the JSON (they go to the PHP error log)
error_reporting(E_ALL);

require __DIR__ . '/helpers.php';
require __DIR__ . '/db.php';
require __DIR__ . '/ai.php';

try {
    date_default_timezone_set((string) cfg('timezone') ?: 'UTC');
} catch (Throwable $e) {
    date_default_timezone_set('UTC');
}

/* ------------------------------------------------------------ form "kinds" --
 * For each kind the admin dashboard can list: the table, and which columns are
 * shown to the admin (output name => column). Adding a form = add a line here. */
function kinds(): array
{
    return [
        'petition'      => ['petition_signatures', ['name' => 'name', 'email' => 'email', 'anonymous' => 'anonymous']],
        'pledges'       => ['pledges', ['method' => 'method', 'wallet' => 'wallet', 'amount' => 'amount', 'name' => 'name', 'anonymous' => 'anonymous']],
        'fundraisers'   => ['fundraiser_ideas', ['name' => 'name', 'email' => 'email', 'kind' => 'kind', 'idea' => 'idea']],
        'volunteers'    => ['volunteers', ['name' => 'name', 'email' => 'email', 'role' => 'role', 'organization' => 'organization', 'activities' => 'activities', 'time' => 'time_commitment', 'message' => 'message']],
        'role-interest' => ['role_interest', ['name' => 'name', 'email' => 'email', 'role' => 'role', 'message' => 'message']],
        'contact'       => ['contact_messages', ['name' => 'name', 'email' => 'email', 'topic' => 'topic', 'message' => 'message']],
        'partners'      => ['partner_applications', ['organization' => 'organization', 'type' => 'partner_type', 'contact' => 'contact_person', 'position' => 'position', 'email' => 'email', 'phone' => 'phone', 'city' => 'city', 'ways' => 'ways', 'message' => 'message']],
        'supporters'    => ['supporters', ['name' => 'name', 'email' => 'email', 'role' => 'role', 'level' => 'level']],
    ];
}

function form_guard(): array
{
    guard_post();
    throttle('form', client_ip(), (int) cfg('forms_per_hour'), 3600);
    return body();
}

function bool_in(array $b, string $k): int
{
    return !empty($b[$k]) && $b[$k] !== 'false' ? 1 : 0;
}

function insert_row(string $table, array $row): void
{
    $cols = implode(',', array_map(fn($c) => "`$c`", array_keys($row)));
    $marks = implode(',', array_fill(0, count($row), '?'));
    db()->prepare("INSERT INTO `$table` ($cols) VALUES ($marks)")->execute(array_values($row));
}

/** True when $table has $col (checked once per request). Lets new columns be optional. */
function has_column(string $table, string $col): bool
{
    static $memo = [];
    $k = $table . '.' . $col;
    if (!isset($memo[$k])) {
        $st = db()->prepare('SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?');
        $st->execute([$table, $col]);
        $memo[$k] = (int) $st->fetchColumn() > 0;
    }
    return $memo[$k];
}

function user_by_email(string $email): ?array
{
    $st = db()->prepare('SELECT * FROM users WHERE email = ?');
    $st->execute([strtolower(trim($email))]);
    return $st->fetch() ?: null;
}

function app_tz(): DateTimeZone
{
    try {
        return new DateTimeZone((string) cfg('timezone'));
    } catch (Throwable $e) {
        return new DateTimeZone('UTC');
    }
}

function utc_str(DateTimeImmutable $d): string
{
    return $d->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s');
}

/* ===================================================================== routes */
$R = [];

/* ----- health / public ----- */
$R['GET ping'] = function () {
    $out = ['cleanEnergy' => true, 'ai' => (string) cfg('anthropic_api_key') !== ''];
    try {
        db()->query('SELECT 1');
        $out['db'] = true;
    } catch (Throwable $e) {
        $out['db'] = false;
        $out['hint'] = 'Cannot reach MySQL. Is MySQL started in XAMPP, and did you import database/clean_energy.sql?';
        if (cfg('debug')) {
            $out['error'] = $e->getMessage();
        }
    }
    send($out);
};

$R['GET stats'] = function () {
    send(['signatures' => (int) db()->query('SELECT COUNT(*) FROM petition_signatures')->fetchColumn()]);
};

/* ----- accounts ----- */
$R['GET auth/me'] = function () {
    $u = current_user();
    send(['ok' => true, 'user' => $u ? public_user($u) : null]);
};

$R['POST auth/register'] = function () {
    guard_post();
    throttle('register', client_ip(), 10, 3600);
    $b = body();
    $name  = field($b, 'name', 100, 1, 'Please enter your name.');
    $email = email_field($b);
    $pw    = password_field($b, 'password');

    $pdo = db();
    $pdo->beginTransaction();
    try {
        $count = (int) $pdo->query('SELECT COUNT(*) FROM users FOR UPDATE')->fetchColumn();
        $adminEmail = strtolower(trim((string) cfg('admin_email')));
        $role = $adminEmail !== '' ? ($email === $adminEmail ? 'admin' : 'user') : ($count === 0 ? 'admin' : 'user');
        $pdo->prepare('INSERT INTO users (name, email, password_hash, role, last_login, login_count) VALUES (?, ?, ?, ?, UTC_TIMESTAMP(), 1)')
            ->execute([$name, $email, password_hash($pw, PASSWORD_DEFAULT), $role]);
        $pdo->commit();
    } catch (PDOException $e) {
        $pdo->rollBack();
        if (($e->errorInfo[1] ?? 0) === 1062) {
            throw new ApiError('An account with this email already exists. Try logging in.', 409, 'email');
        }
        throw $e;
    }
    $u = user_by_email($email);
    start_login($u, true);
    send(['ok' => true, 'user' => public_user($u), 'firstAdmin' => $u['role'] === 'admin']);
};

$R['POST auth/login'] = function () {
    guard_post();
    $b = body();
    $email = email_field($b);
    $pw = (string) ($b['password'] ?? '');
    $ip = client_ip();
    $ek = 'e:' . substr(hash('sha256', $email), 0, 16);
    if (rate_count('login_fail', $ip, 900) >= 20 || rate_count('login_fail', $ek, 900) >= 8) {
        throw new ApiError('Too many log-in attempts. Please wait a few minutes and try again.', 429);
    }
    $u = user_by_email($email);
    if (!$u) {
        rate_hit('login_fail', $ip);
        rate_hit('login_fail', $ek);
        throw new ApiError('No account found with this email. Create one first.', 404, 'email');
    }
    if (!password_verify($pw, $u['password_hash'])) {
        rate_hit('login_fail', $ip);
        rate_hit('login_fail', $ek);
        throw new ApiError('That password is not correct.', 401, 'pw');
    }
    if (password_needs_rehash($u['password_hash'], PASSWORD_DEFAULT)) {
        db()->prepare('UPDATE users SET password_hash = ? WHERE id = ?')->execute([password_hash($pw, PASSWORD_DEFAULT), $u['id']]);
    }
    $adminEmail = strtolower(trim((string) cfg('admin_email')));
    if ($adminEmail !== '' && $u['email'] === $adminEmail && $u['role'] !== 'admin') {
        db()->prepare("UPDATE users SET role = 'admin' WHERE id = ?")->execute([$u['id']]);
        $u['role'] = 'admin';
    }
    db()->prepare('UPDATE users SET last_login = UTC_TIMESTAMP(), login_count = login_count + 1 WHERE id = ?')->execute([$u['id']]);
    start_login($u, !empty($b['remember']));
    send(['ok' => true, 'user' => public_user($u)]);
};

$R['POST auth/logout'] = function () {
    guard_post();
    end_session();
    send(['ok' => true]);
};

$R['POST auth/forgot'] = function () {
    guard_post();
    throttle('reset', client_ip(), 6, 900);
    $email = email_field(body());
    $u = user_by_email($email);
    if (!$u) {
        throw new ApiError('No account found with this email.', 404, 'email');
    }
    $code = (string) random_int(100000, 999999);
    db()->prepare(
        'INSERT INTO password_resets (user_id, code_hash, expires_at, tries)
         VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 10 MINUTE), 0)
         ON DUPLICATE KEY UPDATE code_hash = VALUES(code_hash), expires_at = VALUES(expires_at), tries = 0'
    )->execute([$u['id'], password_hash($code, PASSWORD_DEFAULT)]);

    $out = ['ok' => true, 'minutes' => 10];
    if (cfg('mail_enabled')) {
        $from = preg_replace('/[\r\n]+/', '', (string) cfg('mail_from'));
        @mail($u['email'], 'Your SunLeaf PH password reset code',
            "Hi {$u['name']},\n\nYour password reset code is: $code\nIt works for 10 minutes. If you did not ask for it, ignore this email.\n",
            "From: $from\r\nContent-Type: text/plain; charset=UTF-8");
    }
    if (cfg('dev_show_reset_code') && is_local_request()) {   // only ever on your own computer
        $out['code'] = $code;
        $out['demo'] = true;
    }
    send($out);
};

$R['POST auth/reset'] = function () {
    guard_post();
    throttle('reset_try', client_ip(), 20, 900);
    $b = body();
    $email = email_field($b);
    $code = clean_text($b['code'] ?? '', 10);
    $pw = password_field($b, 'password');
    $u = user_by_email($email);
    $st = db()->prepare('SELECT code_hash, tries, expires_at < UTC_TIMESTAMP() AS expired FROM password_resets WHERE user_id = ?');
    $st->execute([$u['id'] ?? 0]);
    $r = $u ? $st->fetch() : null;
    if (!$r) {
        throw new ApiError('Ask for a new reset code first.', 400);
    }
    $drop = fn() => db()->prepare('DELETE FROM password_resets WHERE user_id = ?')->execute([$u['id']]);
    if ((int) $r['expired'] === 1) {
        $drop();
        throw new ApiError('That code has expired. Ask for a new one.', 400);
    }
    if ((int) $r['tries'] >= 5) {
        $drop();
        throw new ApiError('Too many wrong codes. Ask for a new one.', 400);
    }
    if (!password_verify($code, $r['code_hash'])) {
        db()->prepare('UPDATE password_resets SET tries = tries + 1 WHERE user_id = ?')->execute([$u['id']]);
        throw new ApiError('That code is not correct.', 400, 'code');
    }
    db()->prepare('UPDATE users SET password_hash = ? WHERE id = ?')->execute([password_hash($pw, PASSWORD_DEFAULT), $u['id']]);
    $drop();
    send(['ok' => true]);
};

$R['POST auth/password'] = function () {
    guard_post();
    $u = require_user();
    $b = body();
    if (!password_verify((string) ($b['oldPassword'] ?? ''), $u['password_hash'])) {
        throw new ApiError('Your current password is not correct.', 401, 'old');
    }
    $new = password_field($b, 'newPassword');
    db()->prepare('UPDATE users SET password_hash = ? WHERE id = ?')->execute([password_hash($new, PASSWORD_DEFAULT), $u['id']]);
    session_regenerate_id(true);
    send(['ok' => true]);
};

$R['POST auth/profile'] = function () {
    guard_post();
    $u = require_user();
    $name = field(body(), 'name', 100, 1, 'Please enter your name.');
    db()->prepare('UPDATE users SET name = ? WHERE id = ?')->execute([$name, $u['id']]);
    $u['name'] = $name;
    send(['ok' => true, 'user' => public_user($u)]);
};

/* ----- public forms (saved to MySQL) ----- */
$R['POST petition'] = function () {
    $b = form_guard();
    $name = field($b, 'name', 100, 1, 'Please enter your name.');
    $email = email_field($b);
    try {
        insert_row('petition_signatures', ['name' => $name, 'email' => $email, 'anonymous' => bool_in($b, 'anonymous')]);
    } catch (PDOException $e) {
        if (($e->errorInfo[1] ?? 0) === 1062) {
            send(['ok' => true, 'duplicate' => true]);          // already signed: that's fine
        }
        throw $e;
    }
    send(['ok' => true]);
};

$R['POST pledge'] = function () {
    $b = form_guard();
    $amount = is_numeric($b['amount'] ?? null) ? round((float) $b['amount'], 2) : 0.0;
    if ($amount <= 0 || $amount > 10000000) {
        throw new ApiError('Enter a valid amount.', 422, 'amount');
    }
    $row = [
        'method'    => field($b, 'method', 30, 1, 'Choose a method.'),
        'wallet'    => field($b, 'wallet', 40),
        'amount'    => $amount,
        'name'      => field($b, 'name', 100),
        'anonymous' => bool_in($b, 'anonymous'),
    ];
    $me = current_user();                                   // null when the donor is not logged in
    if ($me && has_column('pledges', 'account_email')) {
        $row['account_email'] = $me['email'];
    }
    insert_row('pledges', $row);
    send(['ok' => true]);
};

$R['POST fundraiser'] = function () {
    $b = form_guard();
    insert_row('fundraiser_ideas', [
        'name'  => field($b, 'name', 100, 1, 'Please enter your name.'),
        'email' => email_field($b),
        'kind'  => field($b, 'kind', 40),
        'idea'  => field($b, 'idea', 2000),
    ]);
    send(['ok' => true]);
};

$R['POST volunteer'] = function () {
    $b = form_guard();
    insert_row('volunteers', [
        'name'            => field($b, 'name', 100, 1, 'Please enter your name.'),
        'email'           => email_field($b),
        'role'            => field($b, 'role', 60),
        'organization'    => field($b, 'organization', 120),
        'activities'      => list_field($b, 'activities', 60, 12, 600),
        'time_commitment' => field($b, 'time', 60),
        'message'         => field($b, 'message', 2000),
    ]);
    send(['ok' => true]);
};

$R['POST role-interest'] = function () {
    $b = form_guard();
    insert_row('role_interest', [
        'name'    => field($b, 'name', 100, 1, 'Please enter your name.'),
        'email'   => email_field($b),
        'role'    => field($b, 'role', 80, 1, 'Choose a role.'),
        'message' => field($b, 'message', 2000),
    ]);
    send(['ok' => true]);
};

$R['POST contact'] = function () {
    $b = form_guard();
    insert_row('contact_messages', [
        'name'    => field($b, 'name', 100, 1, 'Please enter your name.'),
        'email'   => email_field($b),
        'topic'   => field($b, 'topic', 60),
        'message' => field($b, 'message', 3000, 2, 'Please write a message.'),
    ]);
    send(['ok' => true]);
};

$R['POST partner'] = function () {
    $b = form_guard();
    insert_row('partner_applications', [
        'organization'   => field($b, 'organization', 150, 2, 'Please enter your organization.'),
        'partner_type'   => field($b, 'type', 60, 1, 'Please choose a partner type.'),
        'contact_person' => field($b, 'contact', 100, 2, 'Please enter a contact person.'),
        'position'       => field($b, 'position', 100),
        'email'          => email_field($b),
        'phone'          => field($b, 'phone', 40),
        'city'           => field($b, 'city', 100, 2, 'Please tell us where you are based.'),
        'ways'           => list_field($b, 'ways', 60, 10, 400),
        'message'        => field($b, 'message', 3000, 10, 'Please add a short note.'),
    ]);
    send(['ok' => true]);
};

$R['POST supporter'] = function () {
    $b = form_guard();
    $level = in_array($b['level'] ?? '', ['Supporter', 'Advocate', 'Champion'], true) ? $b['level'] : 'Supporter';
    db()->prepare(
        'INSERT INTO supporters (name, email, role, level) VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE name = VALUES(name), role = VALUES(role), level = VALUES(level)'
    )->execute([field($b, 'name', 100, 2, 'Please enter your name.'), email_field($b), field($b, 'role', 60, 1, 'Please choose a role.'), $level]);
    send(['ok' => true]);
};

/* ----- user <-> admin messages ----- */
$R['GET messages/mine'] = function () {
    $u = require_user();
    $st = db()->prepare('SELECT id, sender, body, is_read, seen, created_at FROM messages WHERE user_id = ? ORDER BY created_at, id LIMIT 500');
    $st->execute([$u['id']]);
    $out = [];
    foreach ($st as $m) {
        $out[] = ['id' => (string) $m['id'], 'email' => $u['email'], 'from' => $m['sender'], 'body' => $m['body'],
                  'at' => iso($m['created_at']), 'read' => (bool) $m['is_read'], 'seen' => (bool) $m['seen']];
    }
    send(['ok' => true, 'messages' => $out]);
};

$R['POST messages'] = function () {
    guard_post();
    $u = require_user();
    throttle('msg', 'u' . $u['id'], 30, 3600);
    $text = field(body(), 'body', 1000, 2, 'Write a message first.');
    insert_row('messages', ['user_id' => $u['id'], 'sender' => 'user', 'body' => $text]);
    send(['ok' => true]);
};

$R['POST messages/seen'] = function () {
    guard_post();
    $u = require_user();
    db()->prepare("UPDATE messages SET seen = 1 WHERE user_id = ? AND sender = 'admin'")->execute([$u['id']]);
    send(['ok' => true]);
};

/* ----- admin ----- */
$R['GET admin/summary'] = function () {
    require_admin();
    $pdo = db();
    $tz = app_tz();
    $today = (new DateTimeImmutable('now', $tz))->setTime(0, 0);
    $t0 = utc_str($today);
    $t6 = utc_str($today->modify('-6 day'));
    $t13 = utc_str($today->modify('-13 day'));

    $st = $pdo->prepare(
        "SELECT COUNT(*) AS users, SUM(role = 'admin') AS admins,
                SUM(created_at >= :a) AS new_today, SUM(created_at >= :b) AS new7, SUM(last_login >= :c) AS active_today
         FROM users"
    );
    $st->execute([':a' => $t0, ':b' => $t6, ':c' => $t0]);
    $s = $st->fetch();

    $byDay = [];
    for ($i = 13; $i >= 0; $i--) {
        $byDay[$today->modify("-$i day")->format('Y-m-d')] = 0;
    }
    $q = $pdo->prepare('SELECT created_at FROM users WHERE created_at >= ?');
    $q->execute([$t13]);
    foreach ($q as $row) {
        $k = (new DateTimeImmutable($row['created_at'], new DateTimeZone('UTC')))->setTimezone($tz)->format('Y-m-d');
        if (isset($byDay[$k])) {
            $byDay[$k]++;
        }
    }
    $days = [];
    foreach ($byDay as $d => $n) {
        $days[] = ['date' => $d, 'count' => $n];
    }

    $subs = [];
    foreach (kinds() as $k => [$table]) {
        $subs[$k] = (int) $pdo->query("SELECT COUNT(*) FROM `$table`")->fetchColumn();
    }
    $unread = (int) $pdo->query("SELECT COUNT(*) FROM messages WHERE sender = 'user' AND is_read = 0")->fetchColumn();
    $msgs = (int) $pdo->query('SELECT COUNT(*) FROM messages')->fetchColumn();

    send(['ok' => true, 'summary' => [
        'users' => (int) $s['users'], 'admins' => (int) $s['admins'],
        'newToday' => (int) $s['new_today'], 'new7' => (int) $s['new7'], 'activeToday' => (int) $s['active_today'],
        'byDay' => $days, 'submissions' => $subs, 'unread' => $unread, 'messages' => $msgs,
    ]]);
};

$R['GET admin/users'] = function () {
    require_admin();
    $out = [];
    foreach (db()->query('SELECT name, email, role, created_at, last_login, login_count FROM users ORDER BY created_at, id') as $u) {
        $out[] = ['name' => $u['name'], 'email' => $u['email'], 'role' => $u['role'], 'created' => iso($u['created_at']),
                  'lastLogin' => iso($u['last_login']), 'logins' => (int) $u['login_count']];
    }
    send(['ok' => true, 'users' => $out]);
};

$R['POST admin/role'] = function () {
    guard_post();
    require_admin();
    $b = body();
    $role = $b['role'] ?? '';
    if ($role !== 'admin' && $role !== 'user') {
        throw new ApiError('Unknown role.', 422);
    }
    $u = user_by_email((string) ($b['email'] ?? ''));
    if (!$u) {
        throw new ApiError('User not found.', 404);
    }
    if ($u['role'] === 'admin' && $role === 'user') {
        $admins = (int) db()->query("SELECT COUNT(*) FROM users WHERE role = 'admin'")->fetchColumn();
        if ($admins < 2) {
            throw new ApiError('There must be at least one admin.', 409);
        }
    }
    db()->prepare('UPDATE users SET role = ? WHERE id = ?')->execute([$role, $u['id']]);
    send(['ok' => true]);
};

$R['POST admin/remove'] = function () {
    guard_post();
    $me = require_admin();
    $u = user_by_email((string) (body()['email'] ?? ''));
    if (!$u) {
        throw new ApiError('User not found.', 404);
    }
    if ((int) $u['id'] === (int) $me['id']) {
        throw new ApiError('You cannot remove your own account.', 409);
    }
    db()->prepare('DELETE FROM users WHERE id = ?')->execute([$u['id']]);   // their messages are removed too
    send(['ok' => true]);
};

$R['GET admin/submissions'] = function () {
    require_admin();
    $kind = (string) ($_GET['kind'] ?? '');
    $defs = kinds();
    if (!isset($defs[$kind])) {
        throw new ApiError('Unknown list.', 400);
    }
    [$table, $map] = $defs[$kind];
    if ($kind === 'pledges' && has_column('pledges', 'account_email')) {
        $map['account'] = 'account_email';
    }
    $sel = [];
    foreach ($map as $alias => $col) {
        $sel[] = "`$col` AS `$alias`";
    }
    $rows = db()->query('SELECT ' . implode(', ', $sel) . ", created_at FROM `$table` ORDER BY created_at DESC, id DESC LIMIT 5000")->fetchAll();
    foreach ($rows as &$r) {
        if (array_key_exists('anonymous', $r)) {
            $r['anonymous'] = (bool) $r['anonymous'];
        }
        if (array_key_exists('amount', $r)) {
            $r['amount'] = (float) $r['amount'];
        }
        $r['at'] = iso($r['created_at']);
        unset($r['created_at']);
    }
    unset($r);
    send(['ok' => true, 'items' => $rows]);
};

$R['GET admin/threads'] = function () {
    require_admin();
    $rows = db()->query(
        'SELECT m.id, m.sender, m.body, m.is_read, m.seen, m.created_at, u.name, u.email
         FROM messages m JOIN users u ON u.id = m.user_id
         ORDER BY m.id DESC LIMIT 2000'
    )->fetchAll();
    $by = [];
    foreach (array_reverse($rows) as $m) {
        $e = $m['email'];
        $by[$e] ??= ['email' => $e, 'name' => $m['name'], 'messages' => [], 'unread' => 0];
        $msg = ['id' => (string) $m['id'], 'email' => $e, 'from' => $m['sender'], 'body' => $m['body'],
                'at' => iso($m['created_at']), 'read' => (bool) $m['is_read'], 'seen' => (bool) $m['seen']];
        if ($m['sender'] === 'user') {
            $msg['name'] = $m['name'];
            if (!$m['is_read']) {
                $by[$e]['unread']++;
            }
        }
        $by[$e]['messages'][] = $msg;
    }
    $list = array_values($by);
    usort($list, fn($a, $b) => strcmp(end($b['messages'])['at'], end($a['messages'])['at']));
    send(['ok' => true, 'threads' => $list]);
};

$R['POST admin/reply'] = function () {
    guard_post();
    require_admin();
    $b = body();
    $u = user_by_email((string) ($b['email'] ?? ''));
    if (!$u) {
        throw new ApiError('User not found.', 404);
    }
    $text = field($b, 'body', 1000, 1, 'Write a reply first.');
    insert_row('messages', ['user_id' => $u['id'], 'sender' => 'admin', 'body' => $text]);
    send(['ok' => true]);
};

$R['POST admin/read'] = function () {
    guard_post();
    require_admin();
    $u = user_by_email((string) (body()['email'] ?? ''));
    if ($u) {
        db()->prepare("UPDATE messages SET is_read = 1 WHERE user_id = ? AND sender = 'user'")->execute([$u['id']]);
    }
    send(['ok' => true]);
};

/* ----- AI support bot ----- */
$R['POST chat'] = function () {
    guard_post();
    throttle('ai', client_ip(), (int) cfg('ai_per_hour'), 3600);
    $b = body();
    $msgs = is_array($b['messages'] ?? null) ? $b['messages'] : [];
    $reply = ai_reply($msgs, clean_text($b['page'] ?? '', 60));
    send(['ok' => true, 'reply' => $reply]);
};

/* ================================================================= dispatch */
function route_path(): string
{
    $p = $_SERVER['PATH_INFO'] ?? '';
    if ($p === '') {                                   // some servers don't set PATH_INFO
        $uri = (string) parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH);
        $i = strpos($uri, 'index.php');
        $p = $i !== false ? substr($uri, $i + 9) : '';
    }
    return trim(rawurldecode($p), '/');
}

try {
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    if ($method === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
    $path = route_path();
    $key = "$method $path";
    if (isset($R[$key])) {
        $R[$key]();
    }
    foreach (['GET', 'POST'] as $m) {
        if ($m !== $method && isset($R["$m $path"])) {
            header('Allow: ' . $m);
            throw new ApiError('Method not allowed.', 405);
        }
    }
    throw new ApiError('Not found.', 404);
} catch (ApiError $e) {
    $out = ['ok' => false, 'error' => $e->getMessage()];
    if ($e->field !== null) {
        $out['field'] = $e->field;
    }
    send($out, $e->status);
} catch (Throwable $e) {
    error_log('[clean-energy] ' . get_class($e) . ': ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    $msg = cfg('debug') ? $e->getMessage() : 'Something went wrong on the server. Please try again.';
    if ($e instanceof PDOException && !cfg('debug')) {
        $msg = 'The database is not reachable. Check that MySQL is running in XAMPP and that clean_energy.sql was imported.';
    }
    send(['ok' => false, 'error' => $msg], 500);
}
