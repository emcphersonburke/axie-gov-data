import { Theme } from '@nivo/core'

export const nivoTheme: Theme = {
  text: {
    fill: '#ffffff',
    fontSize: 12,
  },
  axis: {
    domain: {
      line: {
        stroke: '#777777',
        strokeWidth: 1,
      },
    },
    legend: {
      text: {
        fontSize: 12,
        fill: '#ffffff',
      },
    },
    ticks: {
      line: {
        stroke: '#777777',
        strokeWidth: 1,
      },
      text: {
        fontSize: 11,
        fill: '#ffffff',
      },
    },
  },
  grid: {
    line: {
      stroke: '#444444',
      strokeWidth: 1,
    },
  },
  legends: {
    text: {
      fontSize: 12,
      fill: '#ffffff',
    },
  },
  tooltip: {
    container: {
      background: '#1c1f25',
      color: '#ffffff',
      fontSize: 12,
    },
  },
  labels: {
    text: {
      fontSize: 11,
      fill: '#ffffff',
    },
  },
  markers: {
    lineColor: '#ffffff',
    lineStrokeWidth: 1,
    text: {
      fontSize: 12,
      fill: '#ffffff',
      fontFamily: 'sans-serif',
      outlineWidth: 0,
      outlineColor: 'transparent',
      outlineOpacity: 1,
    },
  },
}

export const nivoColors = {
  growthAxs: ['#9967fb'],
  growthWeth: ['#0094ff'],
  barChartColors: {
    accessory: '#dd8a0e',
    ascension: '#fa59a0',
    charm: '#fa59a0',
    axie: '#00f5f8',
    breeding: '#00f5f8',
    evolution: '#6db80f',
    rune: '#8e97a8',
    sale: '#0094ff',
    'No NFT Transfer': '#dd8a0e',
    land: '#6db80f',
    'land item': '#0094ff',
    material: '#9967fb',
    'rc-mint': '#9967fb',
  },
}
