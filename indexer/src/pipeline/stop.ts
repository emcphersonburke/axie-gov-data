/** Cooperative shutdown flag: loops check `requested` between batches and finish the in-flight one. */
export class Stopper {
  requested = false
  private resolvers: Array<() => void> = []

  request(): void {
    if (this.requested) return
    this.requested = true
    for (const r of this.resolvers) r()
    this.resolvers = []
  }

  /** Sleep that returns early when a stop is requested. */
  sleep(ms: number): Promise<void> {
    if (this.requested) return Promise.resolve()
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.resolvers = this.resolvers.filter((r) => r !== wake)
        resolve()
      }, ms)
      const wake = () => {
        clearTimeout(timer)
        resolve()
      }
      this.resolvers.push(wake)
    })
  }
}
