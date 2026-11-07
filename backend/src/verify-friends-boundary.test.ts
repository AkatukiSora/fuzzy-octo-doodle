import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const script = fileURLToPath(new URL("../scripts/verify-friends.mjs", import.meta.url));
const secret = "boundary-secret-must-not-appear";
const invalidUrls = [
  {
    name: "remote host",
    url: "postgresql://hermes:" + secret + "@203.0.113.8:15432/friends_test_boundary",
    message: "database host must be loopback or a private Unix socket",
  },
  {
    name: "wrong scheme",
    url: "mysql://hermes:" + secret + "@127.0.0.1:15432/friends_test_boundary",
    message: "FRIENDS_TEST_DATABASE_URL scheme must be postgres or postgresql",
  },
  {
    name: "wrong database name",
    url: "postgresql://hermes:" + secret + "@127.0.0.1:15432/production",
    message: "database name must match friends_test_*",
  },
  {
    name: "TCP query override",
    url: "postgresql://hermes:" + secret + "@127.0.0.1:15432/friends_test_boundary?host=203.0.113.9",
    message: "TCP database URL query overrides are not allowed",
  },
  {
    name: "duplicate socket keys",
    url: "postgresql://hermes:" + secret + "@/friends_test_boundary?host=%2Ftmp&host=%2Fvar%2Ftmp&port=15432",
    message: "database URL query keys must not repeat",
  },
  {
    name: "non-private socket directory",
    url: "postgresql://hermes:" + secret + "@/friends_test_boundary?host=%2Ftmp&port=15432",
    message: "Unix socket directory must be owned by the current user with mode 0700",
  },
];

for (const scenario of invalidUrls) {
  test(`rejects ${scenario.name} before importing the app or connecting`, () => {
    const result = spawnSync(process.execPath, [script], {
      encoding: "utf8",
      env: { ...process.env, FRIENDS_TEST_DATABASE_URL: scenario.url },
    });
    assert.notEqual(result.status, 0, `${scenario.name} must exit non-zero`);
    assert.ok(result.stderr.includes(scenario.message), `${scenario.name} should report its boundary failure: ${result.stderr}`);
    assert.doesNotMatch(result.stderr, /Cannot find package|ECONNREFUSED/);
    assert.doesNotMatch(`${result.stdout}${result.stderr}`, new RegExp(secret));
  });
}
