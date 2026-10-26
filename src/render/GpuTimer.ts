/**
 * GPU time per frame from EXT_disjoint_timer_query_webgl2, for performance work (dev hooks).
 * Results come back a few frames late; frames whose timing the GPU disowns (disjoint) are dropped.
 */
export class GpuTimer {
  private readonly ext: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null;
  private readonly pending: WebGLQuery[] = [];
  private active: WebGLQuery | null = null;
  /** GPU milliseconds of recent frames, oldest first. */
  readonly times: number[] = [];

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  }

  get available(): boolean {
    return !!this.ext;
  }

  begin(): void {
    if (!this.ext || this.active) return;
    this.active = this.gl.createQuery();
    if (this.active) this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, this.active);
  }

  end(): void {
    if (!this.ext || !this.active) return;
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this.pending.push(this.active);
    this.active = null;
    this.collect();
  }

  private collect(): void {
    const gl = this.gl;
    const disjoint = gl.getParameter(this.ext!.GPU_DISJOINT_EXT);
    while (this.pending.length && gl.getQueryParameter(this.pending[0], gl.QUERY_RESULT_AVAILABLE)) {
      const query = this.pending.shift()!;
      if (!disjoint) this.times.push(gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6);
      gl.deleteQuery(query);
    }
    if (this.times.length > 2000) this.times.splice(0, 1000);
  }
}
