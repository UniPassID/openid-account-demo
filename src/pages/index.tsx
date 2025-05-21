import { useState } from "react";
import { useAsyncEffect } from "ahooks";
import { BigNumber, providers } from "ethers";
import { Button, Input, notification, InputNumber } from "antd";
import { formatEther, isAddress, parseEther } from "ethers/lib/utils";
import { CredentialResponse, GoogleLogin } from "@react-oauth/google";
import { JwtPayload, jwtDecode } from "jwt-decode";
import ReactJson from "react-json-view";
import { UserOperationStruct } from "@account-abstraction/contracts";
import {
  constructOpenIdAccount,
  ProviderUrl,
  calcGasCost,
  sendUserOpToBundler,
  waitForUserOpReceiptWithRetry,
  BundlerUrl,
} from "./utils";
import { OpenIDAccount } from "../utils";
import styles from "./index.less";

export default function HomePage() {
  const [api, contextHolder] = notification.useNotification();
  const [jwt, setJwt] = useState<JwtPayload | undefined>();
  const [ownerAddress, setOwnerAddress] = useState<string>("");
  const [sendETHAmount, setSendETHAmount] = useState<string>("0.001");
  const [sendToAddress, setSendToAddress] = useState<string>("");
  const [genAddressLoading, setGenAddressLoading] = useState<boolean>(false);
  const [ethLoading, setEthLoading] = useState<boolean>(false);
  const [deployWalletLoading, setDeployWalletLoading] =
    useState<boolean>(false);
  const [sendETHLoading, setSendETHLoading] = useState<boolean>(false);
  const [openIDAccount, setOpenIDAccount] = useState<
    OpenIDAccount | undefined
  >();
  const [walletAddress, setWalletAddress] = useState("");
  const [estimatedGasCostEther, setEstimatedGasCostEther] = useState("0");
  const [ethBalance, setEthBalance] = useState("0");
  const [userOp, setUserOp] = useState<UserOperationStruct | undefined>();
  const [userOpHash, setUserOpHash] = useState<string | undefined>();
  const [isDeployed, setIsDeployed] = useState<boolean>(false);
  const [isOauth, setIsOauth] = useState<boolean>(false);

  useAsyncEffect(async () => {
    if (openIDAccount?.audiences) {
      await estimateCost();
    }
  }, [openIDAccount]);

  const getAddress = async () => {
    try {
      setGenAddressLoading(true);
      const account = await constructOpenIdAccount(ownerAddress, jwt!);
      console.log(account);
      const address = await account.getAddress();
      console.log(`account.isDeployed: ${account.isDeployed}`);
      setIsDeployed(account.isDeployed ?? false);
      setOpenIDAccount(account);
      console.log(`generated wallet address: ${address}`);
      setWalletAddress(address);
    } finally {
      setGenAddressLoading(false);
    }
  };

  const estimateCost = async () => {
    try {
      console.log("estimateCost");
      setEthLoading(true);
      const userOp = await openIDAccount?.createUnsignedUserOp({
        target: "0x",
        data: "0x",
      });
      let callGasLimit = BigNumber.from(await userOp!.callGasLimit);
      if (callGasLimit < BigNumber.from(33100)) {
        userOp!.callGasLimit = 33100;
      }

      const estimatedGasCost = await calcGasCost(userOp!);
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
      const provider = new providers.JsonRpcProvider(ProviderUrl);
      const balance = await provider.getBalance(address);
      setEthBalance(formatEther(balance));
    } finally {
      setEthLoading(false);
    }
  };

  const deployWallet = async () => {
    try {
      setDeployWalletLoading(true);
      setIsOauth(true);
      console.log("createUnsignedUserOp...");
      const userOp = await openIDAccount?.createUnsignedUserOp({
        target: "0x",
        data: "0x",
      });
      let callGasLimit = BigNumber.from(await userOp!.callGasLimit);
      if (callGasLimit < BigNumber.from(33100)) {
        userOp!.callGasLimit = 33100;
      }
      setUserOp(userOp);
      const userOpHash = await openIDAccount?.getUserOpHash(userOp!);
      console.log("createUnsignedUserOp finish: ", userOp);
      console.log("userOpHash: ", userOpHash);
      setUserOpHash(userOpHash);
    } catch (e: any) {
      api.error({
        message: "Transaction failed",
        description: ((e.message ?? "") as string).slice(0, 300),
        placement: "bottomRight",
      });
    }
  };

  const onUserOpHashOAuthSuccess = async (
    credentialResponse: CredentialResponse
  ) => {
    console.log(credentialResponse);
    setIsOauth(false);
    const signature = openIDAccount?.generateSignature(
      credentialResponse.credential!
    );
    if (!signature) return;
    console.log("signature: ", signature);
    console.log("sig_len: ", signature?.length);

    userOp!.signature = signature;
    try {
      const uoHash = await sendUserOpToBundler(openIDAccount!, userOp!);
      console.log("uoHash: ", uoHash);
      
      const txHash = await waitForUserOpReceiptWithRetry(
        uoHash.userOpHash,
        BundlerUrl,
        openIDAccount!
      );
      
      console.log("deploy tx hash: ", txHash);
      api.success({
        message: "Deploy Success",
        description: `txHash: ${txHash}`,
        placement: "bottomRight",
      });
      setIsDeployed(true);
    } catch (e: any) {
      api.error({
        message: "Deploy failed",
        description: ((e.message ?? "") as string).slice(0, 300),
        placement: "bottomRight",
      });
    } finally {
      setDeployWalletLoading(false);
    }
  };

  const sendETH = async () => {
    try {
      setSendETHLoading(true);
      setIsOauth(true);
      console.log("sendETH...");
      const userOp = await openIDAccount?.createUnsignedUserOp({
        target: sendToAddress,
        data: "0x",
        value: parseEther(sendETHAmount),
      });
      setUserOp(userOp);
      const userOpHash = await openIDAccount?.getUserOpHash(userOp!);
      console.log("createUnsignedUserOp finish: ", userOp);
      setUserOpHash(userOpHash);
    } catch (e: any) {
      api.error({
        message: "Transaction failed",
        description: ((e.message ?? "") as string).slice(0, 300),
        placement: "bottomRight",
      });
    }
  };

  const onSendETHUserOpHashOAuthSuccess = async (
    credentialResponse: CredentialResponse
  ) => {
    setIsOauth(false);
    console.log(credentialResponse);
    const signature = openIDAccount?.generateSignature(
      credentialResponse.credential!
    );
    if (!signature) return;
    console.log("signature: ", signature);
    console.log("sig_len: ", signature?.length);

    userOp!.signature = signature;
    try {
      const uoHash = await sendUserOpToBundler(openIDAccount!, userOp!);
      console.log("uoHash: ", uoHash);
      
      const txHash = await waitForUserOpReceiptWithRetry(
        uoHash.userOpHash,
        BundlerUrl,
        openIDAccount!
      );
      
      console.log("send tx hash: ", txHash);
      api.success({
        message: "Transaction Success",
        description: `txHash: ${txHash}`,
        placement: "bottomRight",
      });
    } catch (e: any) {
      api.error({
        message: "Transaction failed",
        description: ((e.message ?? "") as string).slice(0, 300),
        placement: "bottomRight",
      });
    } finally {
      setSendETHLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      {contextHolder}
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
              style={{ marginLeft: "12px" }}
            >
              Refresh
            </Button>
          </div>
          {!isDeployed ? (
            <div className={styles.genAddress}>
              {userOpHash && isOauth ? (
                <GoogleLogin
                  width={400}
                  size="large"
                  onSuccess={onUserOpHashOAuthSuccess}
                  nonce={userOpHash}
                  onError={() => {
                    setIsOauth(false);
                    console.log("Deploy Failed");
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
          ) : (
            <div className={styles.genAddress}>
              <div>
                Send{"  "}
                <InputNumber
                  placeholder="ETH"
                  defaultValue={0.001}
                  min={0}
                  onChange={(value) =>
                    setSendETHAmount(value?.toString() ?? "0")
                  }
                />
                {"  "}
                Sepolia ETH to
              </div>
              <Input
                placeholder="Ethereum Address"
                onChange={(e) => setSendToAddress(e.target.value)}
              />
              <br />
              <br />
              {userOpHash && isOauth ? (
                <GoogleLogin
                  width={400}
                  size="large"
                  onSuccess={onSendETHUserOpHashOAuthSuccess}
                  nonce={userOpHash}
                  onError={() => {
                    setIsOauth(false);
                    console.log("Send Failed");
                  }}
                />
              ) : (
                <Button
                  onClick={sendETH}
                  loading={sendETHLoading}
                  disabled={
                    parseFloat(sendETHAmount) <= 0 ||
                    parseFloat(ethBalance) <= 0 ||
                    sendToAddress.length <= 0 ||
                    !isAddress(sendToAddress)
                  }
                >
                  Confirm
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
