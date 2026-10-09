import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
PROTO_ROOT = ROOT / "contracts" / "proto"
OUT = Path(__file__).resolve().parents[1]


def main() -> None:
    protos = sorted(p.relative_to(PROTO_ROOT).as_posix() for p in PROTO_ROOT.rglob("*.proto"))
    subprocess.run(
        [
            sys.executable,
            "-m",
            "grpc_tools.protoc",
            f"-I{PROTO_ROOT}",
            f"--python_out={OUT}",
            f"--grpc_python_out={OUT}",
            f"--pyi_out={OUT}",
            *protos,
        ],
        check=True,
        cwd=PROTO_ROOT,
    )
    package_root = OUT / "ragspace"
    (package_root / "__init__.py").touch()
    for directory in package_root.rglob("*"):
        if directory.is_dir():
            (directory / "__init__.py").touch()
    print(f"Generated {len(protos)} proto files into {package_root}")


if __name__ == "__main__":
    main()
