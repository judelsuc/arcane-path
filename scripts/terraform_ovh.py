"""Run Terraform with a private OpenStack token, without sourcing OpenRC."""

import argparse
import os
from pathlib import Path
import re
import shlex
import stat
import subprocess


def private_file(path):
    if path.is_symlink() or not path.is_file():
        raise ValueError("Expected a regular private credentials file.")
    if stat.S_IMODE(path.stat().st_mode) & 0o077:
        raise ValueError("Credentials files require permissions 600.")
    return path.read_text()


def session_environment(openrc, token_file):
    allowed = {"OS_AUTH_URL", "OS_REGION_NAME", "OS_TENANT_ID", "OS_PROJECT_ID"}
    values = {}
    for line in private_file(openrc).splitlines():
        match = re.fullmatch(r"\s*(?:export\s+)?(OS_[A-Z_]+)=(.*?)\s*", line)
        if not match or match[1] not in allowed:
            continue
        parts = shlex.split(match[2], comments=True)
        if len(parts) != 1 or any(char in parts[0] for char in ("$", "`", "\n")):
            raise ValueError("OpenRC settings must be literal values, not shell expressions.")
        values[match[1]] = parts[0]
    if values.get("OS_AUTH_URL") != "https://auth.cloud.ovh.net/v3":
        raise ValueError("Expected the OVH HTTPS identity endpoint.")
    if values.get("OS_REGION_NAME") != "EU-WEST-PAR":
        raise ValueError("Only the approved Paris region is configured.")
    project = values.get("OS_PROJECT_ID") or values.get("OS_TENANT_ID")
    if not project or not re.fullmatch(r"[a-fA-F0-9]{32}", project):
        raise ValueError("A literal OpenStack project ID is required.")
    token = private_file(token_file).strip()
    if not token or any(char.isspace() for char in token):
        raise ValueError("Token file must contain only a single token.")
    environment = {key: value for key, value in os.environ.items()
                   if not key.startswith(("OS_", "OVH_", "TF_LOG"))}
    environment.update(values)
    environment.update(OS_TOKEN=token, OS_PROJECT_ID=project, OS_TENANT_ID=project,
                       OS_AUTH_TYPE="v3token", TF_IN_AUTOMATION="true")
    return environment


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--openrc", type=Path, default=Path.home() / "Downloads/openrc.sh")
    parser.add_argument("--token-file", type=Path,
                        default=Path.home() / ".config/arcane-path/openstack-token")
    parser.add_argument("--terraform", default="terraform")
    parser.add_argument("arguments", nargs=argparse.REMAINDER)
    args = parser.parse_args()
    if not args.arguments:
        parser.error("Provide Terraform arguments after --, e.g. -- -chdir=infra plan")
    try:
        environment = session_environment(args.openrc, args.token_file)
    except (OSError, ValueError):
        parser.exit(1, "Cannot load private OpenStack configuration; check paths, permissions and literal settings.\n")
    os.umask(0o077)
    arguments = args.arguments[1:] if args.arguments[0] == "--" else args.arguments
    result = subprocess.run([args.terraform, *arguments], env=environment, check=False)
    raise SystemExit(result.returncode)


if __name__ == "__main__":
    main()
