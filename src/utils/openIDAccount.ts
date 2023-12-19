import { BigNumber, BigNumberish, Contract } from "ethers";
import { Interface, resolveProperties, solidityPack } from "ethers/lib/utils";
import {
  // eslint-disable-next-line camelcase
  EntryPoint__factory,
  UserOperationStruct,
} from "@account-abstraction/contracts";
import {
  BaseAccountAPI,
  calcPreVerificationGas,
} from "@account-abstraction/sdk";
import { BaseApiParams } from "@account-abstraction/sdk/dist/src/BaseAccountAPI";

import { isContractDeployed } from "./utils";
import base64url from "base64url";
import { OpenIDAccountABI, OpenIDAccountFactoryABI } from ".";

export const DUMMY_PAYMASTER_AND_DATA =
  "0x0101010101010101010101010101010101010101000000000000000000000000000000000000000000000000000001010101010100000000000000000000000000000000000000000000000000000000000000000101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101";

export const DUMMY_SIGNATURE =
  "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

export interface OpenIDAccountApiParams extends BaseApiParams {
  factoryAddress: string;
  owner?: string;
  openid_key?: string;
  audiences?: string[];
  key_ids?: string[];
  keys?: string[];
  accountAddress?: string;
  isDeployed?: boolean;
}

export class OpenIDAccount extends BaseAccountAPI {
  public readonly factoryAddress: string;

  public readonly owner?: string;

  public readonly openid_key?: string;

  public readonly audiences?: string[];

  public readonly key_ids?: string[];

  public readonly keys?: string[];

  public isDeployed?: boolean;

  constructor(params: OpenIDAccountApiParams) {
    super(params);
    this.factoryAddress = params.factoryAddress;
    this.owner = params.owner;
    this.openid_key = params.openid_key;
    this.audiences = params.audiences;
    this.key_ids = params.key_ids;
    this.keys = params.keys;
    this.isDeployed = params.isDeployed;

    this.accountAddress = params.accountAddress;
  }

  async initialize() {
    if (this.accountAddress != undefined) {
      return;
    }
    const factory = new Contract(
      this.factoryAddress,
      OpenIDAccountFactoryABI.abi,
      this.provider
    );
    const accountAddress = await factory.getAddress(
      0,
      this.owner,
      this.openid_key,
      this.audiences,
      this.key_ids,
      this.keys
    );
    this.accountAddress = accountAddress;

    const deployed = await isContractDeployed(
      this.accountAddress!,
      this.provider
    );

    if (deployed) {
      console.log("contract deployed");
      this.isDeployed = deployed;
    }
  }

  async getAccountInitCode(): Promise<string> {
    if (this.isDeployed) {
      return "0x";
    }

    const factory = new Contract(
      this.factoryAddress,
      OpenIDAccountFactoryABI.abi,
      this.provider
    );

    if (this.accountAddress === undefined) {
      const accountAddress = await factory.getAddress(
        0,
        this.owner,
        this.openid_key,
        this.audiences,
        this.key_ids,
        this.keys
      );
      this.accountAddress = accountAddress;
    }
    const deployed = await isContractDeployed(
      this.accountAddress!,
      this.provider
    );

    if (deployed) {
      this.isDeployed = deployed;

      return "0x";
    }

    const calldata = factory.interface.encodeFunctionData(
      "createAccount(uint256,address,bytes32,bytes32[],bytes32[],bytes[])",
      [
        0,
        this.owner!,
        this.openid_key!,
        this.audiences!,
        this.key_ids!,
        this.keys!,
      ]
    );
    console.log(`isDeployed: ${deployed}`);
    console.log(`callData: ${calldata}`);

    return solidityPack(["address", "bytes"], [this.factoryAddress, calldata]);
  }

  async getAddress(): Promise<string> {
    if (this.accountAddress !== undefined && this.accountAddress !== "") {
      return this.accountAddress;
    }
    const factory = new Contract(
      this.factoryAddress,
      OpenIDAccountFactoryABI.abi,
      this.provider
    );
    const accountAddress = await factory.callStatic.getAddress(
      0,
      this.owner,
      this.openid_key,
      this.audiences,
      this.key_ids,
      this.keys
    );

    console.log("getAddress: ", accountAddress);

    return accountAddress;
  }

  /**
   * return maximum gas used for verification.
   * NOTE: createUnsignedUserOp will add to this value the cost of creation, if the contract is not yet created.
   */
  override async getVerificationGasLimit() {
    console.log("getVerificationGasLimit", 620000);
    return Promise.resolve(620000);
  }

  async encodeExecute(
    target: string,
    value: BigNumberish,
    data: string
  ): Promise<string> {
    if (target === "" || target === "0x") {
      return "0x";
    }
    const openIDAccountInterface = new Interface(OpenIDAccountABI.abi);
    const calldata = openIDAccountInterface.encodeFunctionData(
      "execute(address, uint256, bytes)",
      [target, value, data]
    );

    return calldata;
  }

  async signUserOpHash(): Promise<string> {
    throw new Error("Method not implemented.");
  }

  async getNonce(): Promise<BigNumber> {
    // eslint-disable-next-line camelcase
    const entrypoint = EntryPoint__factory.connect(
      this.entryPointAddress,
      this.provider
    );

    return await entrypoint.getNonce(this.getAddress(), 0);
  }

  async getPreVerificationGas(
    userOp: Partial<UserOperationStruct>
  ): Promise<number> {
    const p = await resolveProperties({
      ...userOp,
      paymasterAndData: DUMMY_SIGNATURE,
      signature: DUMMY_SIGNATURE,
    });

    return calcPreVerificationGas(p, this.overheads) + 5000;
  }

  async constructUserOperation(
    target: string,
    value: BigNumberish,
    data: string
  ): Promise<UserOperationStruct> {
    const nonce = await this.getNonce();

    return await this.createUnsignedUserOp({
      target,
      data,
      value,
      nonce,
    });
  }

  public generateSignature(idToken: string): string {
    const [headerBase64, payloadBase64, signatureBase64] = idToken.split(".");
    const header = base64url.toBuffer(headerBase64);
    const payload = base64url.toBuffer(payloadBase64);
    const signature = base64url.toBuffer(signatureBase64);

    const issLeftIndex = payload.indexOf('"iss":"') + 7;
    let issRightIndex = payload.indexOf('",', issLeftIndex);
    issRightIndex =
      issRightIndex >= 0 ? issRightIndex : payload.indexOf('"}', issLeftIndex);
    const kidLeftIndex = header.indexOf('"kid":"') + 7;
    let kidRightIndex = header.indexOf('",', kidLeftIndex);
    kidRightIndex =
      kidRightIndex >= 0 ? kidRightIndex : header.indexOf('"}', kidLeftIndex);

    const iatLeftIndex = payload.indexOf('"iat":') + 6;
    const expLeftIndex = payload.indexOf('"exp":') + 6;

    const subLeftIndex = payload.indexOf('"sub":"') + 7;
    let subRightIndex = payload.indexOf('",', subLeftIndex);
    subRightIndex =
      subRightIndex >= 0 ? subRightIndex : payload.indexOf('"}', subLeftIndex);

    const audLeftIndex = payload.indexOf('"aud":"') + 7;
    let audRightIndex = payload.indexOf('",', audLeftIndex);
    audRightIndex =
      audRightIndex >= 0 ? audRightIndex : payload.indexOf('"}', audLeftIndex);

    const nonceLeftIndex = payload.indexOf('"nonce":"') + 9;

    if (
      issLeftIndex < 7 ||
      issRightIndex < 0 ||
      kidLeftIndex < 7 ||
      kidRightIndex < 0 ||
      iatLeftIndex < 6 ||
      expLeftIndex < 6 ||
      subLeftIndex < 7 ||
      subRightIndex < 0 ||
      audLeftIndex < 7 ||
      audRightIndex < 0 ||
      nonceLeftIndex < 9
    ) {
      throw new Error(`Invalid ID Token: ${idToken}`);
    }

    return solidityPack(
      [
        "uint32",
        "uint32",
        "uint32",
        "uint32",
        "uint32",
        "uint32",
        "uint32",
        "uint32",
        "uint32",
        "uint32",
        "uint32",
        "uint32",
        "bytes",
        "uint32",
        "bytes",
        "uint32",
        "bytes",
      ],
      [
        issLeftIndex,
        issRightIndex,
        kidLeftIndex,
        kidRightIndex,
        subLeftIndex,
        subRightIndex,
        audLeftIndex,
        audRightIndex,
        nonceLeftIndex,
        iatLeftIndex,
        expLeftIndex,
        header.length,
        header,
        payload.length,
        payload,
        signature.length,
        signature,
      ]
    );
  }
}
