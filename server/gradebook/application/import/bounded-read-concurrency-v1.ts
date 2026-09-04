export const IMPORT_PLANNER_READ_CONCURRENCY_V1 = 4;

export async function mapWithBoundedConcurrencyV1<Input, Output>(
  inputs: readonly Input[],
  concurrency: number,
  mapper: (input: Input, index: number) => Promise<Output>,
): Promise<Output[]> {
  if (!Number.isInteger(concurrency) || concurrency <= 0) {
    throw new RangeError('concurrency must be a positive integer');
  }
  if (inputs.length === 0) return [];

  const outputs = new Array<Output>(inputs.length);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < inputs.length) {
      const index = nextIndex;
      nextIndex += 1;
      outputs[index] = await mapper(inputs[index]!, index);
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, inputs.length) }, () => worker()));
  return outputs;
}
