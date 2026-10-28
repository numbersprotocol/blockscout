#!/usr/bin/env python3
"""比較既有 visualizer 與 Node 更新後的 HTTP／SVG 行為；不修改鏈上或 explorer 資料。"""

import argparse
import base64
import difflib
import hashlib
import json
import re
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path


SIMPLE = """pragma solidity ^0.8.0;
contract Counter {
    uint256 public value;
    address public owner;
    function increment() public { value += 1; }
}
"""
SOURCES = {
    "lib/Base.sol": "pragma solidity ^0.8.0; contract Base { uint256 internal value; }",
    "Counter.sol": 'pragma solidity ^0.8.0; import "./lib/Base.sol"; contract Counter is Base { address public owner; }',
}


def request(url, payload):
    req = urllib.request.Request(
        url, data=json.dumps(payload).encode(), headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            return response.status, response.headers.get_content_type(), response.read()
    except urllib.error.HTTPError as error:
        return error.code, error.headers.get_content_type(), error.read()


def run(url, artifacts):
    artifacts.mkdir(parents=True, exist_ok=True)
    cases = [
        ("uml", "visualize-contracts", {"sources": {"Counter.sol": SIMPLE}}, 200, "Counter"),
        ("storage", "visualize-storage", {"sources": {"Counter.sol": SIMPLE}, "file_name": "Counter.sol", "contract_name": "Counter"}, 200, "owner"),
        ("uml-import", "visualize-contracts", {"sources": SOURCES}, 200, "Base"),
        ("storage-import", "visualize-storage", {"sources": SOURCES, "file_name": "Counter.sol", "contract_name": "Counter"}, 200, "owner"),
        ("storage-path", "visualize-storage", {"sources": {"src/Counter.sol": SIMPLE}, "file_name": "src/Counter.sol", "contract_name": "Counter"}, 200, "value"),
        ("svg-mask", "visualize-contracts", {"sources": {"Counter.sol": SIMPLE}, "output_mask": {"paths": ["svg"]}}, 200, "Counter"),
        ("missing-contract", "visualize-storage", {"sources": {"Counter.sol": SIMPLE}, "file_name": "Counter.sol", "contract_name": "Missing"}, 400, "Failed to find contract with name"),
        ("syntax-error", "visualize-contracts", {"sources": {"Broken.sol": "pragma solidity ^0.8.0; contract Broken {"}}, 400, "Failed to parse solidity code"),
    ]
    results = {}
    for name, route, payload, expected_status, expected_text in cases:
        status, content_type, body = request(url.rstrip("/") + "/api/v1/solidity:" + route, payload)
        assert status == expected_status, (name, status, body.decode(errors="replace"))
        if status == 200:
            data = json.loads(body)
            assert content_type == "application/json", (name, content_type)
            assert data.get("svg"), (name, data)
            svg = base64.b64decode(data["svg"], validate=True)
            (artifacts / f"{name}.svg").write_bytes(svg)
            assert ET.fromstring(svg).tag == "{http://www.w3.org/2000/svg}svg", name
            assert expected_text in svg.decode(), name
            results[name] = {"status": status, "content_type": content_type, "keys": sorted(data), "svg_sha256": hashlib.sha256(svg).hexdigest()}
        else:
            text = body.decode()
            assert expected_text in text, (name, text)
            # sol2uml 的錯誤包含服務每次產生的 tempfile 路徑；僅正規化該隨機部分。
            text = re.sub(r"/tmp/\.tmp[A-Za-z0-9]+", "/tmp/TEMP", text)
            (artifacts / f"{name}.txt").write_text(text)
            results[name] = {"status": status, "content_type": content_type, "body": text}
        print(f"PASS {name}: HTTP {status}", flush=True)
    return results


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", required=True)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--baseline", type=Path)
    args = parser.parse_args()
    actual = run(args.url, args.output.with_suffix(""))
    args.output.write_text(json.dumps(actual, indent=2, ensure_ascii=False) + "\n")
    if args.baseline:
        baseline = json.loads(args.baseline.read_text())
        if actual != baseline:
            print("".join(difflib.unified_diff(
                json.dumps(baseline, indent=2, ensure_ascii=False).splitlines(keepends=True),
                json.dumps(actual, indent=2, ensure_ascii=False).splitlines(keepends=True),
                fromfile="baseline", tofile="candidate",
            )), flush=True)
        assert actual == baseline, "與 baseline 的 HTTP／JSON／SVG 結果不相同"
        print("PASS baseline 比較：所有 HTTP／JSON／SVG SHA256 相同", flush=True)
    print(f"{len(actual)} tests passed, 0 failed", flush=True)
