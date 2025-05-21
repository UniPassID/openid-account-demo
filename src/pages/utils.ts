import { BigNumber, Signer, providers } from "ethers";
import {
  keccak256,
  solidityPack,
  toUtf8Bytes,
  hexlify,
} from "ethers/lib/utils";
import base64url from "base64url";
import { JwtPayload } from "jwt-decode";
import { OpenIDAccount, utils } from "../utils";
import { HttpRpcClient } from "@account-abstraction/sdk";
import {
  EntryPoint__factory,
  UserOperationStruct,
} from "@account-abstraction/contracts";

// export const BundlerUrl = "https://api.blocknative.com/v1/goerli/bundler";
// export const BundlerUrl = "https://api.gelato.digital//bundlers/5/rpc"
// export const BundlerUrl = "https://bundler-goerli.edennetwork.io"
// export const BundlerUrl = "https://goerli-bundler.etherspot.io";
// export const BundlerUrl = "https://testnet-rpc.etherspot.io/v1/11155111?api-key=etherspot_3ZJzKKmnJMtqhaEhKrSMoDkk";
// export const BundlerUrl = "http://192.168.15.215:4337/";
// export const BundlerUrl = "https://public.stackup.sh/api/v1/node/ethereum-goerli";
// export const BundlerUrl = "https://eth-sepolia.g.alchemy.com/v2/rzvib9_XWW8ZbMbPgnkMFi3u2acg0WJ2";
export const BundlerUrl = "https://api.candide.dev/bundler/v3/sepolia/b6993f5e0678ab3b6076cbaf48984fcd";
export const ProviderUrl = "https://eth-sepolia.g.alchemy.com/v2/zwSHMTpT98Rnrn9RGRjbD";
export const EntryPointAddr = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";
export const FactoryAddr = "0x3E1543668D6c06E359F5F03c3261C9bB99439a8A";
export const ChainId = 11155111;

export const constructOpenIdAccount = async (
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
  const provider = new providers.JsonRpcProvider(ProviderUrl);

  const openIDAccount = new OpenIDAccount({
    factoryAddress: FactoryAddr,
    provider,
    entryPointAddress: EntryPointAddr,
    owner: ownerAddress,
    openid_key,
    audiences: [audience],
    key_ids: [keyId1, keyId2],
    keys: [hexlify(public_key1), hexlify(public_key2)],
  });

  await openIDAccount.initialize();

  return openIDAccount;
};

export const estimateGasByBundler = async (userOp: UserOperationStruct) => {
  const client = new HttpRpcClient(BundlerUrl, EntryPointAddr, ChainId);
  const gasInfo = await client.estimateUserOpGas(userOp);
  return gasInfo;
};

export const sleep = (ms: number) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

export const sendUserOpToBundler = async (
  openIDAccount: OpenIDAccount,
  userOp: UserOperationStruct
) => {
  const client = new HttpRpcClient(BundlerUrl, EntryPointAddr, ChainId);
  const uoHash = await client.sendUserOpToBundler(userOp!);
  let deployed = false;
  if (!openIDAccount.isDeployed) {
    await sleep(1500);
    const accountAddress = await openIDAccount.getAddress();
    for (let i = 0; i < 20; i++) {
      deployed = await utils.isContractDeployed(
        accountAddress,
        openIDAccount.provider
      );
      if (deployed) {
        openIDAccount.isDeployed = deployed;

        return {
          userOpHash: uoHash,
          isDeployed: openIDAccount.isDeployed,
        };
      }
      await sleep(500);
    }
  }

  return {
    userOpHash: uoHash,
    isDeployed: openIDAccount.isDeployed,
  };
};

export const sendUserOpBySigner = async (
  userOp: UserOperationStruct,
  signer: Signer
) => {
  const gasCost = await calcGasCost(userOp);
  const entryPoint = EntryPoint__factory.connect(EntryPointAddr, signer);
  let receipt = await (
    await entryPoint.handleOps([userOp], signer.getAddress(), {
      gasLimit: gasCost.add(1000000),
    })
  ).wait();
  console.log(receipt);
};

export const calcGasLimit = async (userOp: UserOperationStruct) => {
  const gasUsed = BigNumber.from(await userOp.preVerificationGas)
    .add(BigNumber.from(await userOp.verificationGasLimit))
    .add(BigNumber.from(await userOp.callGasLimit));

  return gasUsed;
};

export const calcGasCost = async (userOp: UserOperationStruct) => {
  const gasLimit = await calcGasLimit(userOp);
  const gasPrice = BigNumber.from(await userOp.maxFeePerGas);
  return gasLimit.mul(gasPrice);
};

export const waitForUserOpReceiptWithRetry = async (
  userOpHash: string,
  bundlerUrl: string,
  openIDAccount: OpenIDAccount,
  timeout: number = 3 * 60 * 1000 // 3 minutes default timeout
): Promise<string> => {
  // First try the original getUserOpReceipt
  try {
    const txHash = await openIDAccount.getUserOpReceipt(userOpHash);
    if (txHash) {
      return txHash;
    }
  } catch (e) {
    console.log("getUserOpReceipt failed, trying RPC polling:", e);
  }

  // If getUserOpReceipt fails or returns null, try RPC polling
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    try {
      // Try eth_getUserOperationByHash
      const response = await fetch(bundlerUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 0,
          method: 'eth_getUserOperationByHash',
          params: [userOpHash]
        })
      });

      const userOpResponse = await response.json();
      
      if (userOpResponse.error) {
        throw new Error(userOpResponse.error.message);
      }

      if (userOpResponse.result) {
        // If transaction is included in a block
        if (userOpResponse.result.blockHash && userOpResponse.result.transactionHash) {
          return userOpResponse.result.transactionHash;
        }
      }

      // Wait for 2 seconds before next poll
      await sleep(2000);
    } catch (e: any) {
      console.log("Polling error:", e);
      // Continue polling unless it's a definitive error
      if (e.message?.includes("AA")) {
        throw e;
      }
    }
  }
  
  throw new Error("Transaction polling timed out after 3 minutes");
};
