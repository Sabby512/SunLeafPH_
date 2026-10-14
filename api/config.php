<?php
/**
 * Clean Energy - backend settings.
 * For a default XAMPP install you do NOT need to change anything to get started.
 */
return [

    /* ---------- MySQL (XAMPP defaults: user "root", empty password) ---------- */
    'db_host'    => '127.0.0.1',
    'db_port'    => 3306,
    'db_name'    => 'clean_energy',
    'db_user'    => 'root',
    'db_pass'    => '',          // XAMPP's default is empty. On a real server use a dedicated user + strong password.

    /* ---------- General ---------- */
    // Used for "today" / "last 14 days" on the admin dashboard. List: php.net/timezones
    'timezone'   => 'Asia/Manila',

    // The email that should become the admin. Leave '' and the FIRST account created becomes the admin.
    'admin_email' => '',

    // true = show technical error details in API responses. Keep false on a public site.
    'debug'      => false,

    /* ---------- "Forgot password" ---------- */
    // On localhost the 6-digit code is shown on screen (XAMPP can't send email out of the box).
    // On any other host the code is NEVER shown; it is emailed with PHP mail() if you turn this on.
    'dev_show_reset_code' => true,
    'mail_enabled'        => false,
    'mail_from'           => 'no-reply@cleanenergy.ph',

    /* ---------- AI support bot (optional) ---------- */
    // Leave the key empty and the chat bot still works using its built-in answers.
    // Add a key from console.anthropic.com to let it answer free-form questions with Claude.
    'anthropic_api_key' => '',
    'anthropic_model'   => 'claude-haiku-5-5',
    'ai_per_hour'       => 20,   // max AI questions per visitor (IP address) per hour
    // XAMPP on Windows sometimes needs this to trust HTTPS sites, e.g. 'C:/xampp/apache/bin/curl-ca-bundle.crt'
    'ca_bundle'         => '',

    /* ---------- Abuse protection ---------- */
    'forms_per_hour'    => 30,   // form submissions per visitor (IP address) per hour
];
