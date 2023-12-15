import { ContractFactory, Wallet, constants, providers } from "ethers";
import {
  hexlify,
  keccak256,
  parseEther,
  solidityPack,
  toUtf8Bytes,
} from "ethers/lib/utils";
import NodeRSA from "node-rsa";
import * as jose from "jose";
import { OpenIDAccountDeployer } from "./deployer";
import EntryPointABI from "./abis/EntryPoint.json";
import { OpenIDAccount } from "./openIDAccount";

export const OPENID_ISSUER = "openID-account:test:issuer";
export const OPENID_AUDIENCE = "openID-account:test:audience";
export const OPENID_KID = "openID-account:test:kid:0";

async function main() {
  let privKey =
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
  let provider = new providers.JsonRpcProvider("http://127.0.0.1:8545");
  let signer = new Wallet(privKey, provider);

  console.log("Deploy Entrypoint...");
  const EntryPoint = new ContractFactory(
    EntryPointABI.abi,
    EntryPointABI.bytecode,
    signer
  );
  const entryPoint = await EntryPoint.deploy();
  await entryPoint.deployed();
  const entryPointAddress = entryPoint.address;

  // const entryPointAddress = "0x5FbDB2315678afecb367f032d93F642f64180aa3"
  console.log("entrypoint ", entryPointAddress);

  const deployer = new OpenIDAccountDeployer({ entrypoint: entryPointAddress });
  await deployer.deployFactory(signer);

  console.log("factory: ", deployer.factoryAddress);

  const nodeRsa = new NodeRSA({ b: 2048 });
  const privateKey = await jose.importPKCS8(
    nodeRsa.exportKey("pkcs8-pem"),
    "RS256"
  );
  const sub = "openID-account:test:sub";
  const owner = Wallet.createRandom();

  const openid_key = keccak256(
    solidityPack(
      ["bytes32", "bytes32"],
      // TODO replace sub
      [keccak256(toUtf8Bytes(OPENID_ISSUER)), keccak256(toUtf8Bytes(sub))]
    )
  );
  const key_id = keccak256(
    solidityPack(
      ["bytes", "bytes"],
      // TODO replace kid
      [toUtf8Bytes(OPENID_ISSUER), toUtf8Bytes(OPENID_KID)]
    )
  );
  const public_key = nodeRsa.exportKey("components-public").n.subarray(1);
  const audience = keccak256(
    solidityPack(
      ["bytes", "bytes"],
      // TODO replace aud
      [toUtf8Bytes(OPENID_ISSUER), toUtf8Bytes(OPENID_AUDIENCE)]
    )
  );

  // TODO
  console.log("contruct account...");
  const openIDAccount = new OpenIDAccount({
    factoryAddress: deployer.factoryAddress,
    provider: provider,
    entryPointAddress: entryPointAddress,
    owner: owner.address,
    openid_key: openid_key,
    audiences: [audience],
    key_ids: [key_id],
    keys: [hexlify(public_key)],
  });

  console.log("transfer eth...");
  // TODO
  const accountAddress = await openIDAccount.getAddress();
  console.log("account:", accountAddress);

  await (
    await signer.sendTransaction({
      to: accountAddress,
      value: parseEther("2.5"),
    })
  ).wait();

  console.log("createUnsignedUserOp...");
  const userOp = await openIDAccount.createUnsignedUserOp({
    target: signer.address,
    value: parseEther("0.5"),
    data: "0x",
    nonce: 0,
  });

  const userOpHash = await openIDAccount.getUserOpHash(userOp);
  console.log("createUnsignedUserOp finish: ", userOp);

  console.log("userOpHash: ", userOpHash);

  const jwt = await new jose.SignJWT({ nonce: userOpHash })
    .setProtectedHeader({ alg: "RS256", kid: OPENID_KID })
    .setIssuer(OPENID_ISSUER)
    .setAudience(OPENID_AUDIENCE)
    .setJti("Test")
    .setExpirationTime("2h")
    .setIssuedAt(Date.now() / 1000 - 300)
    .setSubject(sub)
    .sign(privateKey);

  const signature = openIDAccount.generateSignature(jwt);
  console.log("signature: ", signature);
  console.log("sig_len: ", signature.length);
  userOp.signature = signature;

  // let bundler_url = "http://localhost:4545"
  // let chainId = await signer.getChainId();

  // console.log("chain_Id: ", chainId);
  // const client = new HttpRpcClient(bundler_url, entryPointAddress, chainId);
  // const uoHash = await client.sendUserOpToBundler(userOp);
  // const txHash = await openIDAccount.getUserOpReceipt(uoHash);
  // console.log("tx hash: ", txHash);

  const estimatedGasCost = await openIDAccount.calcGasCost(userOp);
  console.log("estimatedGasCost: ", estimatedGasCost);

  console.log("handleOps...");
  let receipt = await (
    await entryPoint.handleOps([userOp], signer.address, {
      gasLimit: 10000000,
    })
  ).wait();
  console.log(receipt);
}

main();
