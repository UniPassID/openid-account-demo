import { Contract, ContractFactory, Signer, utils } from "ethers";
import { OpenIDAccountFactoryABI } from ".";

const { solidityPack } = utils;

export interface FactoryOptions {
  entrypoint: string;
  factoryAddress?: string;
}

export class OpenIDAccountDeployer {
  public readonly entrypoint: string;

  factoryAddress: string;

  constructor(options: FactoryOptions) {
    const { entrypoint, factoryAddress = "" } = options;

    this.factoryAddress = factoryAddress;
    this.entrypoint = entrypoint;
  }

  public async deployFactory(signer: Signer) {
    const OpenIDAccountFactory = new ContractFactory(
      OpenIDAccountFactoryABI.abi,
      OpenIDAccountFactoryABI.bytecode,
      signer
    );
    const openIDAccountFactory = await OpenIDAccountFactory.deploy(
      this.entrypoint
    );
    await openIDAccountFactory.deployed();

    this.factoryAddress = openIDAccountFactory.address;
  }

  public async getAddress(
    signer: Signer,
    owner: string,
    openidKey: string,
    audiences: [string],
    keyIds: [string],
    keys: [string]
  ): Promise<string> {
    const openIDAccountFactory = new Contract(
      this.factoryAddress,
      OpenIDAccountFactoryABI.abi,
      signer
    );
    const accountAddress = await openIDAccountFactory.getAddress(
      0,
      owner,
      openidKey,
      audiences,
      keyIds,
      keys
    );

    return accountAddress;
  }

  public async deployAccount(
    signer: Signer,
    owner: string,
    openidKey: string,
    audiences: [string],
    keyIds: [string],
    keys: [string]
  ): Promise<string> {
    const accountAddress = await this.getAddress(
      signer,
      owner,
      openidKey,
      audiences,
      keyIds,
      keys
    );
    const openIDAccountFactory = new Contract(
      this.factoryAddress,
      OpenIDAccountFactoryABI.abi,
      signer
    );
    const ret = await (
      await openIDAccountFactory.createAccount(
        0,
        owner,
        openidKey,
        audiences,
        keyIds,
        keys
      )
    ).wait();

    if (ret.status !== 1) {
      const error: any = new Error("Deploy Contract Failed");
      error.ret = ret;
      throw error;
    }

    return accountAddress;
  }

  public async generateInitData(
    owner: string,
    openidKey: string,
    audiences: [string],
    keyIds: [string],
    keys: [string]
  ) {
    const openIDAccountFactory = new Contract(
      this.factoryAddress,
      OpenIDAccountFactoryABI.abi
    );
    const calldata = openIDAccountFactory.interface.encodeFunctionData(
      "createAccount(uint256,address,bytes32,bytes32[],bytes32[],bytes[])",
      [0, owner, openidKey, audiences, keyIds, keys]
    );

    return solidityPack(
      ["address", "bytes"],
      [openIDAccountFactory.address, calldata]
    );
  }
}
