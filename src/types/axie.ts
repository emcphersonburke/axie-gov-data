interface Part {
  key: string
  name: string
  type: string
  sample: string
}

export interface AxieColor {
  key: string
  primary1: string
  primary2: string
}

export interface AxieKey {
  version: number
  items: {
    colors: Array<{ key: string; primary1: string; primary2: string }>
    bodies: string[]
    parts: Part[]
  }
}
