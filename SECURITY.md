# Security policy

## Reporting a vulnerability

Please report suspected vulnerabilities privately to the repository owner or
through GitHub's private security advisory workflow. Include the affected
component, reproduction steps, impact, and a suggested mitigation when known.

Do not publish credentials, tokens, private URLs, or a complete exploit in a
public issue.

## Deployment hygiene

- Keep `.env` files and deployment secrets outside version control.
- Use a high-entropy `JWT_SECRET` and authenticated MQTT credentials.
- Keep the recovery service on the internal network; do not expose port 8000.
- Review authorization on the backend even when a control is hidden in the UI.
