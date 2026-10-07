# Windows code signing

ClipBoost Windows releases should be Authenticode-signed before distribution. This is required to build trust with Windows security features such as Smart App Control and Microsoft Defender SmartScreen.

## Required GitHub secrets

Add these repository secrets in **Settings → Secrets and variables → Actions**:

- `WINDOWS_CSC_LINK`: the code-signing certificate in a form supported by electron-builder. The recommended format for GitHub Actions is a base64-encoded `.pfx` / `.p12` certificate.
- `WINDOWS_CSC_KEY_PASSWORD`: the password protecting that certificate.

Do not commit the certificate or password to the repository.

## Base64-encode a PFX on Windows

PowerShell:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("clipboost-code-signing.pfx")) | Set-Content -NoNewline certificate-base64.txt
```

Copy the contents of `certificate-base64.txt` into the `WINDOWS_CSC_LINK` GitHub secret.

## Build

Run the **Windows Signed Build** workflow manually from GitHub Actions.

The workflow:

1. validates that signing secrets exist;
2. runs tests;
3. creates the NSIS installer through electron-builder;
4. verifies the resulting installer with `Get-AuthenticodeSignature`;
5. fails if the installer is not signed with a valid certificate;
6. uploads the signed installer, `latest.yml`, and blockmap as an artifact.

electron-builder automatically reads `CSC_LINK` and `CSC_KEY_PASSWORD`, so the normal local development build remains unchanged.

## Release requirement

Before publishing a GitHub Release used by ClipBoost auto-update, verify that the uploaded installer is the signed artifact produced by this workflow and that its version matches `package.json`.

A signed installer improves Windows trust, but reputation-based warnings can still take time to disappear for a new certificate.
