import { UserOperationStruct } from "@account-abstraction/contracts";
import { providers, utils } from "ethers";

export function toJSON(op: Partial<UserOperationStruct>): any {
  return utils.resolveProperties(op).then((userOp) =>
    Object.keys(userOp)
      .map((key) => {
        let val = (userOp as any)[key];

        if (typeof val !== "string" || !val.startsWith("0x")) {
          val = utils.hexValue(val);
        }

        return [key, val];
      })
      .reduce(
        (set, [k, v]) => ({
          ...set,
          [k]: v,
        }),
        {}
      )
  );
}

export async function isContractDeployed(
  addr: string,
  provider: providers.Provider
): Promise<boolean> {
  return (await provider.getCode(addr)) !== "0x";
}
