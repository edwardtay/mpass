declare module "snarkjs" {
  export namespace groth16 {
    function fullProve(
      input: Record<string, string | number | bigint>,
      wasmFile: string,
      zkeyFile: string
    ): Promise<{
      proof: {
        pi_a: string[];
        pi_b: string[][];
        pi_c: string[];
        protocol: string;
        curve: string;
      };
      publicSignals: string[];
    }>;

    function verify(
      vkey: object,
      publicSignals: string[],
      proof: object
    ): Promise<boolean>;

    function exportSolidityCallData(
      proof: object,
      publicSignals: string[]
    ): Promise<string>;
  }

  export namespace zKey {
    function exportVerificationKey(zkeyFileName: string): Promise<object>;
  }
}
