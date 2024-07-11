const fs = require('fs')
const path = require('path')

// Generate index files for each directory. This keeps the imports clean without
// having to manually keep the index files up to date.
function generateIndexes(
  directory,
  fileExtension,
  indexFileName,
  keepExtensionPart = false,
) {
  const dirPath = path.join(__dirname, '../src', directory)
  const indexFile = path.join(dirPath, indexFileName)

  fs.readdir(dirPath, (err, files) => {
    if (err) {
      console.error(`Error reading ${directory} directory:`, err)
      return
    }

    const exports = files
      .filter((file) => file.endsWith(fileExtension) && file !== indexFileName)
      .map((file) => {
        const fileName = keepExtensionPart
          ? file.replace('.ts', '')
          : file.replace(fileExtension, '')
        return `export * from './${fileName}';`
      })
      .join('\n')

    fs.writeFile(indexFile, exports, (err) => {
      if (err) {
        console.error(`Error writing ${indexFileName} file:`, err)
        return
      }

      console.log(
        `${indexFileName} file generated successfully in ${directory}.`,
      )
    })
  })
}

generateIndexes('lib/abis', '.ts', 'index.ts')
generateIndexes('media/vectors', '.tsx', 'index.ts')
generateIndexes('types', '.ts', 'index.ts')
generateIndexes('utils', '.ts', 'index.ts')
