/* eslint-disable @typescript-eslint/no-explicit-any -- raw WebGPU, no types installed */

/**
 * Raw WebGPU load with no ONNX Runtime involved, for telling apart "this
 * phone's Safari cannot sustain GPU work" from "the model runtime is the
 * problem".
 *
 *  tiny     one small dispatch per frame, one bind group made once
 *  ortlike  the same call pattern the model runtime produces: ~160
 *           dispatches per frame, each with a fresh bind group and a
 *           uniform write, spread over 11 submits, plus a 1.2 MB read-back
 *           every frame. Sized to keep the GPU busy ~12 ms per frame.
 *
 * Both run at 30 frames per second.
 */

const WGSL = /* wgsl */ `
struct Params { n: u32, a: u32, b: u32, c: u32 };
@group(0) @binding(0) var<storage, read_write> data: array<f32>;
@group(0) @binding(1) var<uniform> p: Params;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  var v = data[id.x];
  for (var i = 0u; i < p.n; i = i + 1u) {
    v = v * 0.99991 + 0.00009;
  }
  data[id.x] = v;
}
`;

// GPUBufferUsage / GPUMapMode values from the WebGPU spec.
const MAP_READ = 0x1;
const COPY_SRC = 0x4;
const COPY_DST = 0x8;
const UNIFORM = 0x40;
const STORAGE = 0x80;

export type ProbeContext = {
  seconds: number;
  isStopped(): boolean;
  beat(frames: number): void;
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function probeRawGpu(kind: "tiny" | "ortlike", ctx: ProbeContext): Promise<{ frames: number; note: string }> {
  const gpu = (navigator as any).gpu;
  if (!gpu) throw new Error("WebGPU is not available in this browser");
  const adapter = await gpu.requestAdapter();
  if (!adapter) throw new Error("No GPU adapter was offered");
  const device = await adapter.requestDevice();

  let lost = "";
  void device.lost.then((info: any) => {
    lost = `${info.reason}: ${info.message}`;
  });

  const shader = device.createShaderModule({ code: WGSL });
  const pipeline = device.createComputePipeline({ layout: "auto", compute: { module: shader, entryPoint: "main" } });
  const layout = pipeline.getBindGroupLayout(0);

  const THREADS = 65536;
  const DATA_BYTES = 1_206_660;
  const data = device.createBuffer({ size: DATA_BYTES, usage: STORAGE | COPY_SRC | COPY_DST });
  const uniform = device.createBuffer({ size: 16, usage: UNIFORM | COPY_DST });
  const readBack = device.createBuffer({ size: DATA_BYTES, usage: MAP_READ | COPY_DST });
  const params = new Uint32Array([1, 0, 0, 0]);
  const bind = () =>
    device.createBindGroup({
      layout,
      entries: [
        { binding: 0, resource: { buffer: data } },
        { binding: 1, resource: { buffer: uniform } },
      ],
    });

  const fixedBind = bind();
  let loops = kind === "tiny" ? 1 : 8;
  let calibrated = kind === "tiny";
  let frames = 0;
  let sample = 0;
  const started = performance.now();

  try {
    while (!ctx.isStopped() && (performance.now() - started) / 1000 < ctx.seconds) {
      if (lost) throw new Error(`GPU device lost (${lost})`);
      const frameStart = performance.now();

      if (kind === "tiny") {
        device.queue.writeBuffer(uniform, 0, params);
        const enc = device.createCommandEncoder();
        const pass = enc.beginComputePass();
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, fixedBind);
        pass.dispatchWorkgroups(16);
        pass.end();
        device.queue.submit([enc.finish()]);
        await device.queue.onSubmittedWorkDone();
      } else {
        params[0] = loops;
        for (let s = 0; s < 11; s += 1) {
          const enc = device.createCommandEncoder();
          const pass = enc.beginComputePass();
          pass.setPipeline(pipeline);
          for (let d = 0; d < 15; d += 1) {
            device.queue.writeBuffer(uniform, 0, params);
            pass.setBindGroup(0, bind());
            pass.dispatchWorkgroups(THREADS / 64);
          }
          pass.end();
          device.queue.submit([enc.finish()]);
        }
        const enc = device.createCommandEncoder();
        enc.copyBufferToBuffer(data, 0, readBack, 0, DATA_BYTES);
        device.queue.submit([enc.finish()]);
        await readBack.mapAsync(1);
        sample = new Float32Array(readBack.getMappedRange())[0];
        readBack.unmap();
      }

      frames += 1;
      ctx.beat(frames);
      const took = performance.now() - frameStart;

      // Find a per-dispatch loop count that keeps the GPU busy ~12 ms a frame.
      if (!calibrated) {
        if (took < 10 && loops < 1 << 16) loops *= 2;
        else calibrated = true;
      }

      const spare = 1000 / 30 - took;
      await sleep(spare > 1 ? spare : 0);
    }
  } finally {
    device.destroy();
  }

  return { frames, note: kind === "ortlike" ? `${loops} loops per dispatch, read-back value ${sample.toFixed(3)}` : "" };
}
