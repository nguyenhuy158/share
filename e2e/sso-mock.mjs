// SSO giả cho E2E local: sinh khoá RSA tạm, phục vụ JWKS tại
// /.well-known/jwks.json và ký cookie `huyab_sso` giống auth.huyab.click.
// Worker chạy với SSO_ISSUER trỏ vào đây (`wrangler dev --var`), nên
// worker/src/sso-verifier.ts vẫn kiểm chữ ký/iss/exp y như production.
import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { createServer } from "node:http";

const KID = "e2e";
const TOKEN_TTL_SECONDS = 3600;

function base64UrlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

/** Bật issuer giả trên cổng trống; trả `issuer`, `mintToken(email, name)`, `close()`. */
export async function startSsoMock() {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwks = JSON.stringify({ keys: [{ ...publicKey.export({ format: "jwk" }), kid: KID, alg: "RS256", use: "sig" }] });

  const server = createServer((request, response) => {
    if (request.url === "/.well-known/jwks.json") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(jwks);
      return;
    }
    response.writeHead(404);
    response.end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const issuer = `http://127.0.0.1:${server.address().port}`;

  function mintToken(email, name) {
    const now = Math.floor(Date.now() / 1000);
    const header = base64UrlJson({ alg: "RS256", typ: "JWT", kid: KID });
    const claims = base64UrlJson({ iss: issuer, sub: randomUUID(), email, name, iat: now, exp: now + TOKEN_TTL_SECONDS });
    const signature = sign("sha256", Buffer.from(`${header}.${claims}`), privateKey).toString("base64url");
    return `${header}.${claims}.${signature}`;
  }

  return { issuer, mintToken, close: () => server.close() };
}
