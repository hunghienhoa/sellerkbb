# SellerKBB update rules

These rules are mandatory for every SellerKBB feature/fix release.

1. Bump VERSION, package.json, wrangler.toml and the UI version together.
2. Update README in all three places: "Cập nhật mới nhất", current usage instructions, and version history.
3. Run static checks and Chromium smoke tests for desktop + mobile.
4. Push the completed source to main.
5. Make sure the production Worker and /preview are actually updated to the new version; a GitHub commit alone is not a completed release.
6. Verify Cloudflare Worker APP_VERSION and deployed commit annotation after deployment.
7. Create/update the GitHub Release with clear Vietnamese notes from README.
8. Keep only the newest 5 GitHub Releases.
9. Never put API tokens, TikTok secrets, Firebase service credentials, cookies, or passwords in GitHub.

Production: https://sellerkbb.doanhsokpis.workers.dev/
Demo: https://sellerkbb.doanhsokpis.workers.dev/preview
