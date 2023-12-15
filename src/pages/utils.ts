import { providers } from "ethers";
import {
  keccak256,
  solidityPack,
  toUtf8Bytes,
  hexlify,
} from "ethers/lib/utils";
import base64url from "base64url";
import { JwtPayload } from "jwt-decode";
import { OpenIDAccount } from "@/utils";

export const generateWalletAddress = async (
  ownerAddress: string,
  jwtPayload: JwtPayload
) => {
  const response = await fetch("https://www.googleapis.com/oauth2/v3/certs");
  const googleCerts = await response.json();

  const keys = googleCerts.keys;

  const keyId1 = keccak256(
    solidityPack(
      ["bytes", "bytes"],
      [toUtf8Bytes(jwtPayload.iss!), toUtf8Bytes(keys[0].kid)]
    )
  );
  const keyId2 = keccak256(
    solidityPack(
      ["bytes", "bytes"],
      [toUtf8Bytes(jwtPayload.iss!), toUtf8Bytes(keys[1].kid)]
    )
  );

  const public_key1 = base64url.toBuffer(keys[0].n);
  const public_key2 = base64url.toBuffer(keys[1].n);

  const openid_key = keccak256(
    solidityPack(
      ["bytes32", "bytes32"],
      [
        keccak256(toUtf8Bytes(jwtPayload.iss!)),
        keccak256(toUtf8Bytes(jwtPayload.sub!)),
      ]
    )
  );
  const audience = keccak256(
    solidityPack(
      ["bytes", "bytes"],
      [toUtf8Bytes(jwtPayload.iss!), toUtf8Bytes(jwtPayload.aud! as string)]
    )
  );
  const provider = new providers.JsonRpcProvider(
    "https://node.wallet.unipass.id/eth-goerli"
  );

  const openIDAccount = new OpenIDAccount({
    factoryAddress: "0x4342Ef649122B81cc81E6156DbBcb8e50CE05B84",
    provider,
    entryPointAddress: "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789",
    owner: ownerAddress,
    openid_key,
    audiences: [audience],
    key_ids: [keyId1, keyId2],
    keys: [hexlify(public_key1), hexlify(public_key2)],
  });

  return openIDAccount;
};
