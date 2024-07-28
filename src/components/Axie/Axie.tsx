import 'pixi-spine'

import {
  getAxieColorPartShift,
  getSpineFromAdultCombo,
  getVariantAttachmentPath,
  MixedSkeletonData,
} from '@axieinfinity/mixer'
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
  loader: PIXI.loaders.Loader,
  mixer: MixedSkeletonData,
  variant: string,
) => {
  const resources = getResources(mixer, variant)
  resources.forEach((item) => {
    if (loader.resources[item.key] === undefined) {
      loader.add(item.key, item.imagePath)
    }
  })
  await new Promise((resolve) => loader.load(resolve))
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

const Figure = PIXI.spine.Spine

interface AxieProps {
  direction: 'left' | 'right'
  app: PIXI.Application
  animation: string
  speed: number
  y: number
  onRemove: () => void
}

const summerColors: AxieColor[] = [
  {
    key: 'aquatic-summer',
    primary1: 'Aquatic',
    primary2: '',
  },
  {
    key: 'bird-summer',
    primary1: 'Bird',
    primary2: '',
  },
  {
    key: 'dawn-summer',
    primary1: 'Dawn',
    primary2: '',
  },
  {
    key: 'mech-summer',
    primary1: 'Mech',
    primary2: '',
  },
  {
    key: 'reptile-summer',
    primary1: 'Reptile',
    primary2: '',
  },
  {
    key: 'beast-summer',
    primary1: 'Beast',
    primary2: '',
  },
  {
    key: 'bug-summer',
    primary1: 'Bug',
    primary2: '',
  },
  {
    key: 'dusk-summer',
    primary1: 'Dusk',
    primary2: '',
  },
  {
    key: 'plant-summer',
    primary1: 'Plant',
    primary2: '',
  },
]

export default function Axie({
  direction,
  app,
  animation,
  speed,
  y,
  onRemove,
}: AxieProps) {
  const createdRef = useRef(false) // Add a ref to track if the Axie is created
  const [isLoading, setIsLoading] = useState(false) // Add state to track loading
  const [hasHydrated, setHasHydrated] = useState(false) // Add state to track loading

  useEffect(() => {
    let spineInstance: PIXI.spine.Spine | null = null

    const createAxie = async () => {
      if (createdRef.current || isLoading) return // Check if the Axie is already created or loading

      setIsLoading(true) // Set loading to true

      console.log('createAxie')
      const container = new PIXI.Container()
      app.stage.addChild(container)

      const combinedColors: AxieColor[] = [...key.items.colors, ...summerColors]
      const axieCombo = generateRandomCombo()
      const randomVariant =
        combinedColors[Math.floor(Math.random() * combinedColors.length)].key

      const spineData = getSpineFromAdultCombo(axieCombo)

      if (!spineData) {
        console.error('No spine data generated.')
        setIsLoading(false)
        return
      }

      const loader = new PIXI.loaders.Loader()
      await loadSpineResources(loader, spineData, randomVariant)

      try {
        const allTextures: { [key: string]: PIXI.Texture } = {}
        Object.values(loader.resources).forEach((resource) => {
          allTextures[resource.name] = resource.texture
        })

        const spineAtlas = new PIXI.spine.core.TextureAtlas()
        spineAtlas.addTextureHash(allTextures, false)

        const spineAtlasLoader = new PIXI.spine.core.AtlasAttachmentLoader(
          spineAtlas,
        )
        const spineJsonParser = new PIXI.spine.core.SkeletonJson(
          spineAtlasLoader,
        )

        const skeletonData = spineJsonParser.readSkeletonData(spineData)

        if (!skeletonData) {
          throw new Error('skeletonData is undefined')
        }
        if (!skeletonData.bones || !skeletonData.slots || !skeletonData.skins) {
          throw new Error('skeletonData is missing critical properties')
        }

        const spine = new Figure(skeletonData)
        spine.scale.set(direction === 'right' ? -0.18 : 0.18, 0.18)

        console.log('setting Y position', y)
        // Adjusting the position to move the Axie down
        spine.position.set(
          direction === 'left' ? app.screen.width + spine.width : spine.width,
          y,
        )

        spine.state.setAnimation(0, animation, true)
        container.addChild(spine)
        spineInstance = spine
        createdRef.current = true // Set the ref to true after creation

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
        setIsLoading(false) // Set loading to false after process
      }
    }

    if (hasHydrated) {
      createAxie()
    }

    return () => {
      if (spineInstance) {
        app.stage.removeChild(spineInstance)
      }
    }
  }, [direction, app, animation, speed, y, onRemove, isLoading, hasHydrated])

  useEffect(() => {
    setHasHydrated(true)
  }, [])

  return null
}
