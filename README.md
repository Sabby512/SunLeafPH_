# SunLeaf PH website: XAMPP + MySQL setup

Needs XAMPP with **PHP 8.0 or newer** (every current XAMPP download).

## Folder layout
```
sunleaf-ph/
├── index.html, why-clean-energy.html (Learn & Explore), our-energy-future.html,
│   take-action.html, sign-petition.html, volunteer.html, donate.html, work-for-us.html,
│   other-ways.html, support.html, partner.html, about.html (About Us & References),
│   contact.html, login.html, register.html, forgot-password.html, account.html, admin.html
├── assets/
│   ├── about-mission.jpg, about-values.jpg   photos on the About Us page (replace with your originals, same file names)
│   ├── ce-chatbot.js          support chat (lower-left)
│   ├── ce-mobile.css          phone fixes, loaded by every page
│   └── ce-theme.css           shared look (spacing, corners, type), loaded last
├── api/
│   ├── index.php              the backend (all /api/... routes)
│   ├── config.php             your settings
│   └── ai.php, db.php, helpers.php
└── database/
    ├── clean_energy.sql       creates the database (required)
    └── upgrade_pledge_account.sql   optional, see below
```

## 1. Put the site in XAMPP
Copy this whole `sunleaf-ph` folder to `C:\xampp\htdocs\` (macOS: `/Applications/XAMPP/htdocs/`).

## 2. Create the database
1. Open the **XAMPP Control Panel** and click **Start** next to **Apache** and **MySQL**.
2. Go to <http://localhost/phpmyadmin>.
3. Click the **Import** tab, choose `database/clean_energy.sql`, click **Import**.

You now have a `clean_energy` database with 13 tables (users, messages, petition_signatures, pledges, volunteers, partner_applications, ...). Safe to import again; it never deletes data.

**Optional:** to show which account made each donation pledge in the Admin page, open the `clean_energy` database in phpMyAdmin, go to the **SQL** tab, paste the contents of `database/upgrade_pledge_account.sql` and click **Go**. The site works fine without it.

## 3. Open the site
<http://localhost/sunleaf-ph/>

Check the backend is alive: <http://localhost/sunleaf-ph/api/index.php/ping>
You should see `{"cleanEnergy":true,"ai":false,"db":true}`. If `db` is `false`, MySQL isn't running or the SQL file wasn't imported.

## 4. Create your admin account
**The first account registered becomes the admin.** Register yours first (Sign up, top right), then open the **Admin** link to see users, form submissions and messages.
To pick the admin yourself instead, set `'admin_email'` in `api/config.php` before anyone registers.

## About Us & References page (`about.html`)
Holds Our Mission and Vision, Our Core Values, Our Commitment to Earth and the References list.
To add a source, open `about.html`, find the comment **HOW TO ADD A SOURCE**, copy one `<li>...</li>` entry to the end of the list and edit it (author, title, publisher, year, link, used on). Numbers are added automatically.

## What goes where
| What visitors do | Saved in table |
|---|---|
| Sign up / log in | `users` (passwords are bcrypt hashes), `sessions` |
| Sign the petition | `petition_signatures` |
| Donate pledge / fundraiser idea | `pledges` / `fundraiser_ideas` (no payment details are ever stored) |
| Volunteer / job interest | `volunteers` / `role_interest` |
| Contact form + chat guest messages | `contact_messages` |
| Partner application, supporter sign-up | `partner_applications`, `supporters` |
| Chat with an admin | `messages` |

Browse them any time in phpMyAdmin, or in the site's own **Admin** page (with CSV export).

## The support chat (lower-left)
* **Assistant tab:** answers questions about the site. Works out of the box with built-in answers.
* **Message admin tab:** logged-in visitors chat with admins (replies appear in the chat; admins reply from the Admin page). Visitors without an account get a contact form.
* **Optional AI:** put an API key from <https://console.anthropic.com> in `api/config.php` (`anthropic_api_key`). Typed questions are then answered by Claude using only this site's facts (kept in `api/ai.php`, update them if you change the site). The built-in answers live in `assets/ce-chatbot.js`. The key stays on the server and is never sent to the browser. Each visitor is limited to 20 AI questions per hour (`ai_per_hour`).

## Settings: `api/config.php`
Defaults work for XAMPP. Things you may change: `timezone`, `admin_email`, `anthropic_api_key`, `forms_per_hour`.

## Troubleshooting
| Problem | Fix |
|---|---|
| Ping shows `"db":false` | Start MySQL in XAMPP; import `clean_energy.sql`; if you set a MySQL root password, put it in `api/config.php` (`db_pass`). |
| Forms say "could not reach the server" | Open the site via `http://localhost/...`, not by double-clicking the HTML file (that uses browser-only storage, no MySQL). |
| MySQL won't start (port 3306 busy) | Another MySQL is running; stop it or change the port in XAMPP and `db_port`. |
| AI answers don't work | Check the key; on Windows set `curl.cainfo` in `php.ini`, or `ca_bundle` in config, to `C:/xampp/apache/bin/curl-ca-bundle.crt`. Errors are written to `xampp/apache/logs/error.log`. |
| "Forgot password" shows no code | The code is only shown on your own computer (localhost). On a real server, turn on `mail_enabled` and set up email in PHP. |

## Before putting it on the internet
* Create a MySQL user just for this site with a strong password. Don't use `root`.
* Use HTTPS (the login cookie is marked `Secure` automatically on HTTPS).
* Set `'debug' => false` (already the default) and `'dev_show_reset_code'` is ignored off-localhost.
* Register your admin account immediately, or set `admin_email`.
* Behind a proxy or CDN, visitor IP addresses (used for rate limits) will all look the same; adjust `client_ip()` in `api/helpers.php` for your proxy.
