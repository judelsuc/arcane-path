from pathlib import Path
import re
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[1]


class HttpsConfigurationTests(unittest.TestCase):
    def test_hitchhiking_is_exact_get_only_proxied_and_retains_preview_protection(self):
        config = (ROOT / "infra/nginx/preview.conf").read_text()
        route = next(line.strip() for line in config.splitlines()
                     if line.strip().startswith('location ~ "^/api/(?:travel|'))
        pattern = re.compile(route.removeprefix('location ~ "').removesuffix('" {'))
        self.assertIsNotNone(pattern.fullmatch("/api/hitchhiking"))
        for path in ["/api/hitchhiking/private", "/api/hitchhiking-extra", "/api/private"]:
            self.assertIsNone(pattern.fullmatch(path))
        endpoint = config.split(route, 1)[1].split("\n    }", 1)[0]
        self.assertIn("limit_except GET { deny all; }", endpoint)
        self.assertIn("proxy_pass http://127.0.0.1:8766;", endpoint)
        self.assertNotIn("auth_basic off", endpoint)
        self.assertIn('auth_basic "Arcane Path private preview";', config)
        self.assertIn("limit_req zone=arcane_api_requests burst=100 nodelay;", config)

    def test_audio_is_served_directly_for_byte_ranges_without_exposing_other_files(self):
        config = (ROOT / "infra/nginx/preview.conf").read_text()
        route = next(line.strip() for line in config.splitlines()
                     if line.strip().startswith('location ~ "^/public/audio/'))
        pattern = re.compile(route.removeprefix('location ~ "').removesuffix('" {'))
        for path in [
            "/public/audio/music/08 - music-night.wav",
            "/public/audio/music/01-music-title.mp3",
            "/public/audio/music/music-title-song.ogg",
            "/public/audio/sfx/sfx-step-road.wav",
        ]:
            self.assertIsNotNone(pattern.fullmatch(path), path)
        for path in [
            "/public/audio/music/.private.wav", "/public/audio/music/README.md",
            "/public/audio/music/nested/song.wav", "/public/audio/music/../song.wav",
            "/public/audio/private/song.wav", "/scripts/travel_server.py",
        ]:
            self.assertIsNone(pattern.fullmatch(path), path)
        endpoint = config.split(route, 1)[1].split("\n    }", 1)[0]
        self.assertIn("limit_except GET { deny all; }", endpoint)
        self.assertIn("root /opt/arcane-path;", endpoint)
        self.assertIn("types { audio/wav wav; audio/mpeg mp3; audio/ogg ogg; }", endpoint)
        self.assertIn("try_files $uri =404;", endpoint)
        self.assertNotIn("proxy_pass", endpoint)
        self.assertNotIn("auth_basic off", endpoint)
        self.assertNotIn("add_header", endpoint)
        self.assertNotIn("audio/(?:music|sfx)/[^/]+", config)

    def test_pixel_tileset_is_explicitly_get_only_not_a_directory_or_remote_script_route(self):
        config = (ROOT / "infra/nginx/preview.conf").read_text()
        endpoint = config.split(r"location ~ ^/public/tilesets/(?:path-pixel\.json|LICENSE\.txt)$ {", 1)[1].split("\n    }", 1)[0]
        self.assertIn("limit_except GET { deny all; }", endpoint)
        self.assertIn("proxy_pass http://127.0.0.1:8766;", endpoint)
        self.assertNotIn("location /public/tilesets", config)

    def test_change_requests_only_accept_bounded_posts_and_private_review_has_no_web_route(self):
        config = (ROOT / "infra/nginx/preview.conf").read_text()
        endpoint = config.split("location = /api/change-requests {", 1)[1].split("\n    }", 1)[0]
        self.assertIn("limit_except POST { deny all; }", endpoint)
        self.assertIn("client_max_body_size 4100000;", endpoint)
        self.assertIn("proxy_pass http://127.0.0.1:8766;", endpoint)
        self.assertNotIn("location = /api/change-requests/review", config)
        bootstrap = (ROOT / "infra/nginx/bootstrap.conf").read_text()
        self.assertIn("location = /api/change-requests {", bootstrap)
        self.assertIn("vendor/(?:html-to-image-1", config)
        timer = (ROOT / "infra/systemd/arcane-change-request-retention.timer").read_text()
        service = (ROOT / "infra/systemd/arcane-change-request-retention.service").read_text()
        self.assertIn("OnCalendar=hourly", timer)
        self.assertIn("Persistent=true", timer)
        self.assertIn("EnvironmentFile=/etc/arcane-path/change-request-retention.env", service)
        self.assertIn("scripts/change_requests.py purge", service)
        self.assertIn("UMask=0077", service)

    def test_town_documentary_content_has_an_exact_post_only_route(self):
        config = (ROOT / "infra/nginx/preview.conf").read_text()
        endpoint = config.split("location = /api/town-content {", 1)[1].split("\n    }", 1)[0]
        self.assertIn("limit_except POST { deny all; }", endpoint)
        self.assertIn("proxy_pass http://127.0.0.1:8766;", endpoint)
        bootstrap = (ROOT / "infra/nginx/bootstrap.conf").read_text()
        endpoint = bootstrap.split("location = /api/town-content {", 1)[1].split("\n    }", 1)[0]
        self.assertIn("limit_except POST { deny all; }", endpoint)
        self.assertIn("return 503;", endpoint)

    def test_inscriptions_have_an_exact_bounded_post_only_route(self):
        config = (ROOT / "infra/nginx/preview.conf").read_text()
        endpoint = config.split("location = /api/inscriptions {", 1)[1].split("\n    }", 1)[0]
        self.assertIn("client_max_body_size 4k;", endpoint)
        self.assertIn("limit_except POST { deny all; }", endpoint)
        self.assertIn("proxy_pass http://127.0.0.1:8766;", endpoint)
        bootstrap = (ROOT / "infra/nginx/bootstrap.conf").read_text()
        endpoint = bootstrap.split("location = /api/inscriptions {", 1)[1].split("\n    }", 1)[0]
        self.assertIn("return 503;", endpoint)

    def test_main_artifacts_have_a_bounded_post_only_route(self):
        config = (ROOT / "infra/nginx/preview.conf").read_text()
        endpoint = config.split("location = /api/artifacts {", 1)[1].split("\n    }", 1)[0]
        self.assertIn("limit_except POST { deny all; }", endpoint)
        self.assertIn("client_max_body_size 2m;", endpoint)
        self.assertIn("proxy_pass http://127.0.0.1:8766;", endpoint)

    def test_individual_art_and_enriched_epic_have_narrow_post_routes_and_nightly_timer(self):
        config = (ROOT / "infra/nginx/preview.conf").read_text()
        for name in ["encounter-art", "live-narrative"]:
            endpoint = config.split(f"location = /api/{name} {{", 1)[1].split("\n    }", 1)[0]
            self.assertIn("limit_except POST { deny all; }", endpoint)
            self.assertIn("proxy_pass http://127.0.0.1:8766;", endpoint)
            if name == "live-narrative":
                self.assertIn("client_max_body_size 16k;", endpoint)
        timer = (ROOT / "infra/systemd/arcane-encounter-art.timer").read_text()
        self.assertIn("OnCalendar=Tue *-*-* 23:00:00 Europe/Paris", timer)
        self.assertIn("Persistent=false", timer)
        service = (ROOT / "infra/systemd/arcane-encounter-art.service").read_text()
        self.assertIn("TimeoutStartSec=7h5min", service)
        self.assertIn("User=arcane", service)
        self.assertNotIn("Restart=", service)

    def test_apex_and_www_share_certificate_and_protected_hosts(self):
        hosts = "server_name arcane-path.eu www.arcane-path.eu;"
        bootstrap = (ROOT / "infra/nginx/bootstrap.conf").read_text()
        preview = (ROOT / "infra/nginx/preview.conf").read_text()
        script = (ROOT / "scripts/configure_https.sh").read_text()
        self.assertEqual(bootstrap.count(hosts), 1)
        self.assertEqual(preview.count(hosts), 2)
        self.assertIn("--domain arcane-path.eu --domain www.arcane-path.eu", script)
        self.assertIn("--cert-name arcane-path.eu", script)
        self.assertIn("return 301 https://arcane-path.eu$request_uri;", preview)

    def test_living_world_preview_and_transport_assets_have_narrow_get_only_routes(self):
        config = (ROOT / "infra/nginx/preview.conf").read_text()
        endpoint = config.split("location = /api/living-world {", 1)[1].split("\n    }", 1)[0]
        self.assertIn("limit_except GET { deny all; }", endpoint)
        self.assertIn("proxy_pass http://127.0.0.1:8766;", endpoint)
        route = next(line.strip() for line in config.splitlines()
                     if line.strip().startswith("location ~ ^/(?:layers/living-world/"))
        pattern = re.compile(route.removeprefix("location ~ ").removesuffix(" {"))
        for path in [
            "/layers/living-world/preview.html", "/layers/living-world/preview.mjs",
            "/layers/living-world/agenda.mjs", "/layers/living-world/demo.mjs",
            "/layers/transport/routes.html", "/layers/transport/routes.mjs",
            "/layers/transport/hybrid.html", "/layers/transport/hybrid-preview.mjs",
            "/layers/transport/transport.mjs", "/layers/transport/hybrid.mjs",
            "/data/transport/CATALOG-LICENSE",
            *["/" + str(p.relative_to(ROOT)) for p in (ROOT / "data/transport").rglob("*")
              if p.is_file() and p.suffix in {".json", ".md"}],
        ]:
            self.assertIsNotNone(pattern.fullmatch(path), path)
        for path in ["/scripts/living_world.py", "/layers/private.txt",
                     "/layers/transport/demo-fixture.mjs", "/layers/living-world/preview.html/extra",
                     "/data/transport/private.zip", "/data/transport/../private.json"]:
            self.assertIsNone(pattern.fullmatch(path), path)
        body = config.split(route, 1)[1].split("\n    }", 1)[0]
        self.assertIn("limit_except GET { deny all; }", body)
        self.assertIn("proxy_pass http://127.0.0.1:8766;", body)

    def test_daily_title_art_is_get_only_and_timer_uses_paris_time(self):
        config = (ROOT / "infra/nginx/preview.conf").read_text()
        route = "location ~ ^/api/start-art(?:/image)?$ {"
        endpoint = config.split(route, 1)[1].split("\n    }", 1)[0]
        self.assertIn("limit_except GET { deny all; }", endpoint)
        self.assertIn("proxy_pass http://127.0.0.1:8766;", endpoint)
        pattern = re.compile(r"^/api/start-art(?:/image)?$")
        for path in ["/api/start-art", "/api/start-art/image"]:
            self.assertIsNotNone(pattern.fullmatch(path))
        for path in ["/api/start-art/queue", "/api/start-art/private", "/api/start-art/image/extra"]:
            self.assertIsNone(pattern.fullmatch(path))
        timer = (ROOT / "infra/systemd/arcane-start-art.timer").read_text()
        self.assertIn("OnCalendar=*-*-* 05:00:00 Europe/Paris", timer)
        self.assertIn("Persistent=true", timer)
        self.assertNotIn("OnUnitActiveSec", timer)
        service = (ROOT / "infra/systemd/arcane-start-art.service").read_text()
        self.assertIn("User=arcane", service)
        self.assertIn("Type=oneshot", service)
        self.assertIn("TimeoutStartSec=5min", service)
        self.assertNotIn("Restart=", service)
        self.assertIn("ARCANE_START_IMAGES_TOKEN_FILE=/etc/arcane-path/ovh-ai-endpoints-token", service)

    def test_notebook_terrain_and_shared_game_styles_reach_the_upstream(self):
        config = (ROOT / "infra/nginx/preview.conf").read_text()
        api = next(line.strip() for line in config.splitlines()
                   if line.strip().startswith('location ~ "^/api/(?:'))
        api_pattern = re.compile(api.split('"')[1])
        self.assertIsNotNone(api_pattern.fullmatch("/api/journey-terrain"))
        self.assertIsNone(api_pattern.fullmatch("/api/journey-terrain/extra"))
        api_body = config.split(api, 1)[1].split("\n    }", 1)[0]
        self.assertIn("limit_except GET { deny all; }", api_body)
        self.assertIn("proxy_pass http://127.0.0.1:8766;", api_body)

        assets = next(line.strip() for line in config.splitlines()
                      if line.strip().startswith("location ~ ^/(?:index"))
        asset_pattern = re.compile(assets.removeprefix("location ~ ").removesuffix(" {"))
        for path in ["/styles.css", "/mini-games.css", "/favicon.svg", "/public/icons/favicon.ico",
                     "/public/icons/favicon-32.png", "/public/icons/apple-touch-icon.png"]:
            self.assertIsNotNone(asset_pattern.fullmatch(path), path)
        self.assertIsNone(asset_pattern.fullmatch("/public/icons/other.png"))
        self.assertIn("location = /favicon.ico {\n        auth_basic off;\n        limit_except GET { deny all; }\n"
                      "        proxy_pass http://127.0.0.1:8766/public/icons/favicon.ico;", config)
        self.assertIn("rewrite ^ /public/icons/apple-touch-icon.png break;", config)
        for path in ["/content-workshop.css", "/scripts/travel_server.py", "/.env",
                     "/infra/nginx/preview.conf", "/mini-games.css/extra"]:
            self.assertIsNone(asset_pattern.fullmatch(path), path)
        asset_body = config.split(assets, 1)[1].split("\n    }", 1)[0]
        self.assertIn("limit_except GET { deny all; }", asset_body)
        self.assertIn("proxy_pass http://127.0.0.1:8766;", asset_body)

    def test_only_public_icon_routes_bypass_preview_authentication(self):
        config = (ROOT / "infra/nginx/preview.conf").read_text()
        routes = re.findall(r"location ([^\n]+) \{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\n    \}", config)
        public = [(route, body) for route, body in routes if "auth_basic off;" in body]
        self.assertEqual(len(public), 3)
        icon_route = next(route for route, _ in public if "favicon\\.svg" in route)
        pattern = re.compile(icon_route.removeprefix("~ "))
        for path in ["/favicon.svg", "/public/icons/favicon.ico", "/public/icons/favicon-32.png",
                     "/public/icons/favicon-192.png", "/public/icons/apple-touch-icon.png"]:
            self.assertIsNotNone(pattern.fullmatch(path), path)
        for path in ["/", "/index.html", "/api/travel", "/public/release.json",
                     "/public/icons/private.png", "/favicon.svg/extra"]:
            self.assertIsNone(pattern.fullmatch(path), path)
        for _, body in public:
            self.assertIn("limit_except GET { deny all; }", body)
        self.assertIn('auth_basic "Arcane Path private preview";', config)

    def test_certificate_scripts_parse_and_require_explicit_agreement(self):
        script = ROOT / "scripts/configure_https.sh"
        subprocess.run(["bash", "-n", str(script)], check=True)
        subprocess.run(["sh", "-n", str(ROOT / "scripts/renew_https_hook.sh")], check=True)
        result = subprocess.run(["bash", str(script), "--help"], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0)
        self.assertIn("--agree-tos", result.stdout)
        for args in [[], ["--email"], ["--unknown"], ["--email", "not-an-email"]]:
            result = subprocess.run(["bash", str(script), *args], capture_output=True, text=True)
            self.assertEqual(result.returncode, 2)
            self.assertNotIn("password:", result.stdout)

    def test_https_config_authenticates_proxy_and_has_no_repository_catchall(self):
        config = (ROOT / "infra/nginx/preview.conf").read_text()
        self.assertIn('auth_basic "Arcane Path private preview";', config)
        self.assertIn("auth_basic_user_file /etc/nginx/arcane-preview.htpasswd;", config)
        for route in ["location = / {", "location = /api/characters {",
                      'location ~ "^/api/(?:']:
            body = config.split(route, 1)[1].split("\n    }", 1)[0]
            self.assertNotIn("auth_basic off", body)
        self.assertIn("location / { return 404; }", config)
        self.assertIn('proxy_set_header Authorization "";', config)
        self.assertIn("proxy_pass http://127.0.0.1:8766;", config)
        self.assertIn("limit_req_status 429;", config)
        self.assertIn("limit_req zone=arcane_creation", config)
        self.assertIn('return 429 \'{"error":', config)
        self.assertIn("add_header Retry-After 10 always;", config)
        self.assertIn("ssl_reject_handshake on;", config)
        audio_route = next(line.strip() for line in config.splitlines()
                           if line.strip().startswith('location ~ "^/public/audio/'))
        audio_body = config.split(audio_route, 1)[1].split("\n    }", 1)[0]
        self.assertNotIn("root /opt/arcane-path", config.replace(audio_body, ""))

    def test_bootstrap_exposes_only_acme_and_renewal_reload_is_checked(self):
        config = (ROOT / "infra/nginx/bootstrap.conf").read_text()
        self.assertIn("location / { return 503; }", config)
        self.assertNotIn("proxy_pass", config)
        script = (ROOT / "scripts/configure_https.sh").read_text()
        self.assertIn("certbot certonly --non-interactive --agree-tos", script)
        self.assertIn("systemctl enable --now certbot.timer", script)
        self.assertIn('nftables.before-https.conf', script)
        hook = (ROOT / "scripts/renew_https_hook.sh").read_text()
        self.assertLess(hook.index("nginx -t"), hook.index("systemctl reload nginx"))

    def test_startup_assets_do_not_share_api_throttling_budgets(self):
        config = (ROOT / "infra/nginx/preview.conf").read_text()
        self.assertRegex(config, r'map \$uri \$arcane_api_client \{\s*'
                         r'default "";\s*~\^/api/ \$binary_remote_addr;\s*\}')
        self.assertIn("limit_req_zone $arcane_api_client "
                      "zone=arcane_api_requests:10m rate=20r/s;", config)
        self.assertIn("limit_conn_zone $arcane_api_client "
                      "zone=arcane_api_connections:1m;", config)
        self.assertIn("limit_req zone=arcane_api_requests burst=100 nodelay;", config)
        self.assertIn("limit_conn arcane_api_connections 20;", config)
        self.assertNotIn("zone=arcane_requests", config)
        self.assertNotIn("zone=arcane_connections", config)
        creation = config.split("location = /api/journeys {", 1)[1].split("\n    }", 1)[0]
        self.assertIn("limit_req zone=arcane_api_requests burst=100 nodelay;", creation)
        self.assertIn("limit_req zone=arcane_creation burst=5 nodelay;", creation)
        self.assertIn("limit_req_zone $binary_remote_addr "
                      "zone=arcane_creation:1m rate=10r/m;", config)

    def test_lore_playtest_explicitly_allows_only_its_page_style_and_post_api(self):
        config = (ROOT / "infra/nginx/preview.conf").read_text()
        endpoint = config.split("location = /api/lore-playtest {", 1)[1].split("\n    }", 1)[0]
        self.assertIn("limit_except POST { deny all; }", endpoint)
        self.assertIn("limit_req zone=arcane_api_requests", endpoint)
        self.assertIn("proxy_pass http://127.0.0.1:8766;", endpoint)
        page = config.split(r"location ~ ^/lore-playtest\.(?:html|css)$ {", 1)[1].split("\n    }", 1)[0]
        self.assertIn("limit_except GET { deny all; }", page)
        self.assertIn("  - nodejs", (ROOT / "infra/cloud-init.yaml").read_text())

    def test_journal_art_is_post_only_and_fresh_servers_have_image_decoder(self):
        config = (ROOT / "infra/nginx/preview.conf").read_text()
        endpoint = config.split("location = /api/journal-art {", 1)[1].split("\n    }", 1)[0]
        self.assertIn("limit_except POST { deny all; }", endpoint)
        self.assertIn("proxy_pass http://127.0.0.1:8766;", endpoint)
        self.assertIn("  - python3-pil", (ROOT / "infra/cloud-init.yaml").read_text())

    def test_live_narrative_is_post_only_and_public_briefs_are_explicitly_allowed(self):
        config = (ROOT / "infra/nginx/preview.conf").read_text()
        endpoint = config.split("location = /api/live-narrative {", 1)[1].split("\n    }", 1)[0]
        self.assertIn("limit_except POST { deny all; }", endpoint)
        self.assertIn("limit_req zone=arcane_api_requests", endpoint)
        self.assertIn("proxy_pass http://127.0.0.1:8766;", endpoint)
        self.assertIn(r"narrative-briefs\.json", config)
        self.assertIn(r"parent-intimacy\.json", config)

    def test_quest_destination_lookup_is_post_only_and_catalogue_is_allowed(self):
        config = (ROOT / "infra/nginx/preview.conf").read_text()
        endpoint = config.split("location = /api/quest-destinations {", 1)[1].split("\n    }", 1)[0]
        self.assertIn("limit_except POST { deny all; }", endpoint)
        self.assertIn("limit_req zone=arcane_api_requests", endpoint)
        self.assertIn("proxy_pass http://127.0.0.1:8766;", endpoint)
        self.assertIn(r"quest-templates\.json", config)

    def test_character_registry_is_post_only_bounded_capability_proxy_and_bootstrap_closed(self):
        preview = (ROOT / "infra/nginx/preview.conf").read_text()
        endpoint = preview.split("location = /api/characters {", 1)[1].split("\n    }", 1)[0]
        self.assertIn("limit_except POST { deny all; }", endpoint)
        self.assertIn("limit_req zone=arcane_api_requests burst=100 nodelay;", endpoint)
        self.assertIn("proxy_pass http://127.0.0.1:8766;", endpoint)
        self.assertIn("client_max_body_size 4k;", preview)
        self.assertIn('proxy_set_header X-Journal-Capability $http_x_journal_capability;', preview)
        self.assertIn('auth_basic "Arcane Path private preview";', preview)
        self.assertIn('proxy_set_header Authorization "";', preview)

        bootstrap = (ROOT / "infra/nginx/bootstrap.conf").read_text()
        bootstrap_endpoint = bootstrap.split(
            "location = /api/characters {", 1)[1].split("\n    }", 1)[0]
        self.assertIn("client_max_body_size 4k;", bootstrap_endpoint)
        self.assertIn("limit_except POST { deny all; }", bootstrap_endpoint)
        self.assertIn("return 503;", bootstrap_endpoint)
        self.assertNotIn("proxy_pass", bootstrap_endpoint)
