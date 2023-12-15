import { useState } from "react";
import { useAsyncEffect } from "ahooks";
import { Wallet, providers } from "ethers";
import { Button, Input } from "antd";
import { formatEther, isAddress } from "ethers/lib/utils";
import { CredentialResponse, GoogleLogin } from "@react-oauth/google";
import { JwtPayload, jwtDecode } from "jwt-decode";
import ReactJson from "react-json-view";
import {
  EntryPoint__factory,
  UserOperationStruct,
} from "@account-abstraction/contracts";
import { HttpRpcClient } from "@account-abstraction/sdk";
import { generateWalletAddress } from "./utils";
import styles from "./index.less";
import { OpenIDAccount } from "@/utils";

export default function HomePage() {
  const [jwt, setJwt] = useState<JwtPayload | undefined>();
  const [ownerAddress, setOwnerAddress] = useState<string>(
    "0x02cFd022397c65C32FA34299Ce8BF3BF7523E973"
  );
  const [genAddressLoading, setGenAddressLoading] = useState<boolean>(false);
  const [ethLoading, setEthLoading] = useState<boolean>(false);
  const [deployWalletLoading, setDeployWalletLoading] =
    useState<boolean>(false);
  const [openIDAccount, setOpenIDAccount] = useState<
    OpenIDAccount | undefined
  >();
  const [walletAddress, setWalletAddress] = useState("");
  const [estimatedGasCostEther, setEstimatedGasCostEther] = useState("0");
  const [ethBalance, setEthBalance] = useState("0");
  const [userOp, setUserOp] = useState<UserOperationStruct | undefined>();
  const [userOpHash, setUserOpHash] = useState<string | undefined>();

  useAsyncEffect(async () => {
    if (openIDAccount?.audiences) {
      await estimateCost();
    }
  }, [openIDAccount]);

  const getAddress = async () => {
    try {
      setGenAddressLoading(true);
      const account = await generateWalletAddress(ownerAddress, jwt!);
      console.log(account);
      const address = await account.getAddress();
      setOpenIDAccount(account);
      console.log(`generated wallet address: ${address}`);
      setWalletAddress(address);
    } finally {
      setGenAddressLoading(false);
    }
  };

  const estimateCost = async () => {
    try {
      setEthLoading(true);
      const userOp = await openIDAccount?.createUnsignedUserOp({
        target: "0x",
        data: "0x",
      });
      console.log("estimateCost");

      console.log(userOp);
      const estimatedGasCost = await openIDAccount?.calcGasCost(userOp!);
      const estimatedGasCostEther = formatEther(estimatedGasCost!);
      console.log("estimatedGasCost: ", estimatedGasCostEther);
      setEstimatedGasCostEther(estimatedGasCostEther);
      await getETHBalance(walletAddress!);
    } finally {
      setEthLoading(false);
    }
  };

  const getETHBalance = async (address: string) => {
    try {
      setEthLoading(true);
      const provider = new providers.JsonRpcProvider(
        "https://node.wallet.unipass.id/eth-goerli"
      );
      const balance = await provider.getBalance(address);
      setEthBalance(formatEther(balance));
    } finally {
      setEthLoading(false);
    }
  };

  const deployWallet = async () => {
    try {
      setDeployWalletLoading(true);
      console.log("createUnsignedUserOp...");
      const userOp = await openIDAccount?.createUnsignedUserOp({
        target: "0x",
        data: "0x",
      });
      setUserOp(userOp);
      const userOpHash = await openIDAccount?.getUserOpHash(userOp!);
      console.log("createUnsignedUserOp finish: ", userOp);
      setUserOpHash(userOpHash);
    } finally {
      setDeployWalletLoading(false);
    }
  };

  const onUserOpHashOAuthSuccess = async (
    credentialResponse: CredentialResponse
  ) => {
    console.log(credentialResponse);
    const signature = openIDAccount?.generateSignature(
      credentialResponse.credential!
    );
    if (!signature) return;
    console.log("signature: ", signature);
    console.log("sig_len: ", signature?.length);

    userOp!.signature = signature;

    // let bundler_url = "https://public.stackup.sh/api/v1/node/ethereum-goerli";

    // const client = new HttpRpcClient(
    //   bundler_url,
    //   "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789",
    //   5
    // );
    // console.log("userOp: ", userOp);
    // const uoHash = await client.sendUserOpToBundler(userOp!);
    // console.log("uoHash: ", uoHash);
    // const txHash = await openIDAccount?.getUserOpReceipt(uoHash);
    // console.log("deploy tx hash: ", txHash);

    const provider = new providers.JsonRpcProvider(
      "https://node.wallet.unipass.id/eth-goerli"
    );
    let signer = new Wallet(
      "0x8703df6310f15eda642837d246d22983f9893244295b6a7b72149f1cf55c5892",
      provider
    );
    const entryPoint = EntryPoint__factory.connect(
      "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789",
      signer
    );
    let receipt = await (
      await entryPoint.handleOps([userOp!], signer.address, {
        gasLimit: 10000000,
      })
    ).wait();
    console.log(receipt);
  };

  return (
    <div className={styles.container}>
      <span className={styles.title}>
        Demo of Building a 4337 Wallet with OpenID signature capability
      </span>
      <div className={styles.step1}>Step1: Generate Wallet Address</div>
      <div className={styles.tip}>
        Please set the Owner Address and connect Google account to generate a
        4337 wallet address.
      </div>
      <div className={styles.ownerAddress}>Owner Address:</div>
      <div className={styles.input}>
        <Input
          placeholder="Owner Address"
          defaultValue="0x02cFd022397c65C32FA34299Ce8BF3BF7523E973"
          onChange={(e) => setOwnerAddress(e.target.value)}
        />
      </div>
      {!!jwt ? (
        <>
          <div className={styles.ownerAddress}>Google Account:</div>
          <div className={styles.jwt}>
            <ReactJson src={jwt} />
          </div>
        </>
      ) : (
        <div className={styles.googleLogin}>
          <GoogleLogin
            width={400}
            size="large"
            onSuccess={(credentialResponse) => {
              console.log(credentialResponse);
              const decoded = jwtDecode(credentialResponse.credential ?? "");
              setJwt(decoded);
            }}
            nonce=""
            onError={() => {
              console.log("Login Failed");
            }}
          />
        </div>
      )}

      {!walletAddress ? (
        <div className={styles.genAddress}>
          <Button
            onClick={getAddress}
            loading={genAddressLoading}
            disabled={!jwt || !isAddress(ownerAddress)}
            style={{ width: "100%" }}
          >
            Generate Wallet Address
          </Button>
        </div>
      ) : null}

      {!walletAddress ? null : (
        <>
          <div className={styles.step1}>Step2: Deploy Wallet</div>
          <div className={styles.tip}>
            Please deposit at least {estimatedGasCostEther} ETH into the
            provided 4337 wallet address and click 'Deploy Wallet' to set up
            your 4337 contract wallet.
          </div>
          <div className={styles.ownerAddress}>
            Your 4337 wallet address: {walletAddress}
          </div>
          <div className={styles.tip}>
            ETH Balance: {ethBalance}ETH
            <Button
              onClick={() => getETHBalance(walletAddress)}
              loading={ethLoading}
            >
              Refresh
            </Button>
          </div>
          <div className={styles.genAddress}>
            {userOpHash ? (
              <GoogleLogin
                width={400}
                size="large"
                onSuccess={onUserOpHashOAuthSuccess}
                nonce={userOpHash}
                onError={() => {
                  console.log("Login Failed");
                }}
              />
            ) : (
              <Button
                onClick={deployWallet}
                loading={deployWalletLoading}
                disabled={parseFloat(ethBalance) <= 0}
                style={{ width: "100%" }}
              >
                Deploy Wallet
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
