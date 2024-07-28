import 'pixi-spine'

import {
  getAxieColorPartShift,
  getSpineFromAdultCombo,
  getVariantAttachmentPath,
  MixedSkeletonData,
} from '@axieinfinity/mixer'
import { TextureAtlas } from '@pixi-spine/base'
import {
  AtlasAttachmentLoader,
  SkeletonJson,
  Spine,
} from '@pixi-spine/runtime-3.8'
import * as PIXI from 'pixi.js'
import React, { useEffect, useRef, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'

import axieKey from '~/data/axieKey.json' assert { type: 'json' }
import { AxieColor, AxieKey } from '~/types'

const key: AxieKey = axieKey

const generateRandomPart = (type: string) => {
  const parts = key.items.parts.filter((part) => part.type === type)
  if (parts.length === 0) {
    console.error(`No parts found for type: ${type}`)
    return ''
  }
  const randomPart = parts[Math.floor(Math.random() * parts.length)]
  return randomPart.sample
}

const generateRandomCombo = () => {
  const axieCombo = new Map<string, string>()
  const earPart = generateRandomPart('ears')
  axieCombo.set('body-id', uuidv4())
  axieCombo.set('body', generateRandomPart('body'))
  axieCombo.set('back', generateRandomPart('back'))
  axieCombo.set('ears', earPart)
  axieCombo.set('ear', earPart)
  axieCombo.set('eyes', generateRandomPart('eyes'))
  axieCombo.set('horn', generateRandomPart('horn'))
  axieCombo.set('mouth', generateRandomPart('mouth'))
  axieCombo.set('tail', generateRandomPart('tail'))
  return axieCombo
}

const loadSpineResources = async (
  mixer: MixedSkeletonData,
  variant: string,
) => {
  const resources = getResources(mixer, variant)
  const textureUrls = resources.map((item) => item.imagePath)
  const loadedTextures = await PIXI.Assets.load(textureUrls)

  const allTextures: { [key: string]: PIXI.Texture } = {}
  resources.forEach((item) => {
    const texture = loadedTextures[item.imagePath]
    if (texture) {
      allTextures[item.key] = texture
    } else {
      console.error(`Texture for ${item.key} is undefined`)
    }
  })

  return allTextures
}

const getResources = (mixer: MixedSkeletonData, variant: string) => {
  const skinAttachments = mixer.skins[0].attachments
  const imagesToLoad: { key: string; imagePath: string }[] = []
  const partColorShift = getAxieColorPartShift(variant)
  const resourcePath = 'https://axiecdn.axieinfinity.com/mixer-stuffs/v5/'

  for (const slotName in skinAttachments) {
    const skinSlotAttachments = skinAttachments[slotName]
    for (const attachmentName in skinSlotAttachments) {
      const path = skinSlotAttachments[attachmentName].path

      // Construct the image path based on the slot and attachment
      const imagePath =
        resourcePath +
        getVariantAttachmentPath(slotName, path, variant, partColorShift)
      imagesToLoad.push({ key: path, imagePath })
    }
  }

  return imagesToLoad
}

interface AxieProps {
  direction: 'left' | 'right'
  app: PIXI.Application
  animation: string
  speed: number
  y: number
  onRemove: () => void
}

export default function Axie({
  direction,
  app,
  animation,
  speed,
  y,
  onRemove,
}: AxieProps) {
  const createdRef = useRef(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isReadyForCreation, setIsReadyForCreation] = useState(false)

  useEffect(() => {
    let spineInstance: Spine | null = null

    const createAxie = async () => {
      if (createdRef.current || isLoading) return

      setIsLoading(true)

      console.log('createAxie')
      const container = new PIXI.Container()
      // app.stage.addChild(container)

      const combinedColors: AxieColor[] = key.items.colors
      const axieCombo = generateRandomCombo()
      const randomVariant =
        combinedColors[Math.floor(Math.random() * combinedColors.length)].key

      const spineData = getSpineFromAdultCombo(axieCombo)

      if (!spineData) {
        console.error('No spine data generated.')
        setIsLoading(false)
        return
      }

      try {
        const allTextures = await loadSpineResources(spineData, randomVariant)

        const spineAtlas = new TextureAtlas()
        spineAtlas.addTextureHash(allTextures, false)

        const spineAtlasLoader = new AtlasAttachmentLoader(spineAtlas)
        const spineJsonParser = new SkeletonJson(spineAtlasLoader)

        const skeletonData = spineJsonParser.readSkeletonData(spineData)

        if (!skeletonData) {
          throw new Error('skeletonData is undefined')
        }
        if (!skeletonData.bones || !skeletonData.slots || !skeletonData.skins) {
          throw new Error('skeletonData is missing critical properties')
        }

        const spine = new Spine(skeletonData)
        spine.scale.set(direction === 'right' ? -0.18 : 0.18, 0.18)

        console.log('setting Y position', y)
        spine.position.set(
          direction === 'left' ? app.screen.width + spine.width : spine.width,
          y,
        )

        spine.zIndex = Math.floor(spine.y)
        spine.state.setAnimation(0, animation, true)
        app.stage.addChild(spine)
        app.stage.sortableChildren = true
        spineInstance = spine
        createdRef.current = true

        app.ticker.add(() => {
          if (spineInstance) {
            spineInstance.x += direction === 'left' ? -speed : speed
            if (
              (direction === 'left' &&
                spineInstance.x < -spineInstance.width) ||
              (direction === 'right' && spineInstance.x > app.screen.width)
            ) {
              container.removeChild(spineInstance)
              onRemove()
            }
          }
        })
      } catch (error) {
        console.error('Error creating spine:', error)
      } finally {
        setIsLoading(false)
        createdRef.current = false
      }
    }

    if (isReadyForCreation) {
      createAxie()
      setIsReadyForCreation(false)
    }

    return () => {
      if (spineInstance) {
        app.stage.removeChild(spineInstance)
      }
    }
  }, [
    direction,
    app,
    animation,
    speed,
    y,
    onRemove,
    isLoading,
    isReadyForCreation,
  ])

  useEffect(() => {
    setIsReadyForCreation(true)
  }, [])

  return null
}
