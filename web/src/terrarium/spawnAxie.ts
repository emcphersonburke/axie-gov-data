import 'pixi-spine'

import type { MixedSkeletonData } from '@axieinfinity/mixer'
import {
  getAxieColorPartShift,
  getSpineFromAdultCombo,
  getVariantAttachmentPath,
} from '@axieinfinity/mixer'
import { TextureAtlas } from '@pixi-spine/base'
import {
  AtlasAttachmentLoader,
  SkeletonJson,
  Spine,
} from '@pixi-spine/runtime-3.8'
import type { Application, Container, Texture } from 'pixi.js'
import { Assets } from 'pixi.js'

import axieKey from '~/data/axieKey.json'
import type { AxieKey } from '~/types/axie'

const key: AxieKey = axieKey
const RESOURCE_PATH = 'https://axiecdn.axieinfinity.com/mixer-stuffs/v5/'
const SCALE = 0.18

export interface SpawnAxieOptions {
  direction: 'left' | 'right'
  /** Spine animation name, e.g. `action/run`. */
  animation: string
  /** Pixels per 60 fps frame. */
  speed: number
  /** Stage y position. */
  y: number
  /** Called once when the axie leaves the stage or is disposed. */
  onExit?: () => void
}

const pick = <T>(items: readonly T[]): T | undefined =>
  items[Math.floor(Math.random() * items.length)]

function randomPart(type: string): string {
  const sample = pick(key.items.parts.filter((part) => part.type === type))
  if (!sample) throw new Error(`axieKey has no parts of type "${type}"`)
  return sample.sample
}

function randomCombo(): Map<string, string> {
  const combo = new Map<string, string>()
  const ears = randomPart('ears')
  combo.set('body-id', crypto.randomUUID())
  combo.set('body', randomPart('body'))
  combo.set('back', randomPart('back'))
  combo.set('ears', ears)
  combo.set('ear', ears)
  combo.set('eyes', randomPart('eyes'))
  combo.set('horn', randomPart('horn'))
  combo.set('mouth', randomPart('mouth'))
  combo.set('tail', randomPart('tail'))
  return combo
}

interface Resource {
  key: string
  imagePath: string
}

function collectResources(
  skeleton: MixedSkeletonData,
  variant: string,
): Resource[] {
  const skin = skeleton.skins[0]
  if (!skin) return []
  const attachments = skin.attachments as Record<
    string,
    Record<string, { path: string }>
  >
  const partColorShift = getAxieColorPartShift(variant)
  const resources: Resource[] = []
  for (const [slotName, slotAttachments] of Object.entries(attachments)) {
    for (const attachment of Object.values(slotAttachments)) {
      const { path } = attachment
      resources.push({
        key: path,
        imagePath:
          RESOURCE_PATH +
          getVariantAttachmentPath(slotName, path, variant, partColorShift),
      })
    }
  }
  return resources
}

async function loadTextures(
  resources: Resource[],
): Promise<Record<string, Texture>> {
  const loaded: Record<string, Texture> = await Assets.load(
    resources.map((r) => r.imagePath),
  )
  const textures: Record<string, Texture> = {}
  for (const resource of resources) {
    const texture = loaded[resource.imagePath]
    if (texture) textures[resource.key] = texture
    else console.warn(`[terrarium] texture missing for ${resource.key}`)
  }
  return textures
}

/** The app has been destroyed once its stage is gone (PIXI nulls it). */
const isDestroyed = (app: Application): boolean =>
  (app.stage as Container | null) === null

/**
 * Build a random adult Axie with the official mixer, add it to the stage and
 * walk it across. Resolves to a disposer that removes the ticker callback and
 * the display object; the axie also disposes itself once it leaves the stage.
 */
export async function spawnAxie(
  app: Application,
  options: SpawnAxieOptions,
): Promise<() => void> {
  const { direction, animation, speed, y, onExit } = options
  const variant = pick(key.items.colors)?.key
  if (!variant) throw new Error('axieKey has no color variants')

  const spineData = getSpineFromAdultCombo(randomCombo())
  if (!spineData) throw new Error('mixer produced no spine data')

  const textures = await loadTextures(collectResources(spineData, variant))
  if (isDestroyed(app)) return () => {}

  const atlas = new TextureAtlas()
  atlas.addTextureHash(textures, false)
  const skeletonData = new SkeletonJson(
    new AtlasAttachmentLoader(atlas),
  ).readSkeletonData(spineData)
  if (!skeletonData?.bones || !skeletonData.slots || !skeletonData.skins)
    throw new Error('skeleton data is missing bones, slots or skins')

  const spine = new Spine(skeletonData)
  spine.scale.set(direction === 'right' ? -SCALE : SCALE, SCALE)
  spine.position.set(
    direction === 'left' ? app.screen.width + spine.width : -spine.width,
    y,
  )
  spine.zIndex = Math.floor(spine.y)
  spine.state.setAnimation(0, animation, true)
  app.stage.addChild(spine)

  let disposed = false
  const dispose = () => {
    if (disposed) return
    disposed = true
    if (!isDestroyed(app)) app.ticker.remove(tick)
    spine.parent?.removeChild(spine)
    spine.destroy()
    onExit?.()
  }

  const tick = (delta: number) => {
    spine.x += (direction === 'left' ? -speed : speed) * delta
    const offStage =
      direction === 'left'
        ? spine.x < -spine.width
        : spine.x > app.screen.width + spine.width
    if (offStage) dispose()
  }
  app.ticker.add(tick)

  return dispose
}
