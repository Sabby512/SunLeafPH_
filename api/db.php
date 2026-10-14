<?php
declare(strict_types=1);

/** Returns the one shared PDO connection to MySQL (created on first use). */
function db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }
    $c = cfg();
    $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $c['db_host'], $c['db_port'], $c['db_name']);
    $pdo = new PDO($dsn, $c['db_user'], $c['db_pass'], [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,   // errors become exceptions we can catch
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,                    // real prepared statements = SQL-injection safe
    ]);
    $pdo->exec("SET time_zone = '+00:00'");                       // every stored time is UTC
    return $pdo;
}

/**
 * Keeps PHP login sessions in the `sessions` table instead of files.
 * (Session files inside htdocs could be downloaded by anyone; a table can't.)
 */
final class DbSessions implements SessionHandlerInterface
{
    public int $life = 28800;      // 8 hours of inactivity; 30 days when "Remember me" is ticked

    public function open(string $path, string $name): bool { return true; }
    public function close(): bool { return true; }

    public function read(string $id): string|false
    {
        $st = db()->prepare('SELECT data, life FROM sessions WHERE id = ? AND expires_at > UTC_TIMESTAMP()');
        $st->execute([$id]);
        $row = $st->fetch();
        if (!$row) {
            return '';
        }
        $this->life = (int) $row['life'];
        return (string) $row['data'];
    }

    public function write(string $id, string $data): bool
    {
        if ($data === '') {
            return true;           // nothing to remember (visitor is not logged in)
        }
        $st = db()->prepare(
            'INSERT INTO sessions (id, data, life, expires_at)
             VALUES (:id, :data, :life, DATE_ADD(UTC_TIMESTAMP(), INTERVAL :secs SECOND))
             ON DUPLICATE KEY UPDATE data = VALUES(data), life = VALUES(life), expires_at = VALUES(expires_at)'
        );
        $st->bindValue(':id', $id);
        $st->bindValue(':data', $data);
        $st->bindValue(':life', $this->life, PDO::PARAM_INT);
        $st->bindValue(':secs', $this->life, PDO::PARAM_INT);
        $st->execute();
        return true;
    }

    public function destroy(string $id): bool
    {
        db()->prepare('DELETE FROM sessions WHERE id = ?')->execute([$id]);
        return true;
    }

    public function gc(int $max_lifetime): int|false
    {
        return db()->exec('DELETE FROM sessions WHERE expires_at < UTC_TIMESTAMP()');
    }
}
