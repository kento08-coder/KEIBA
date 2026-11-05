import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import { PredictionDocumentSchema } from '../src/domain/validation/prediction'
import { ResultDocumentSchema } from '../src/domain/validation/result'

const outputDirectory = path.resolve('schemas')

const schemas = [
  {
    fileName: 'prediction.schema.json',
    id: 'https://kento08-coder.github.io/KEIBA/schemas/prediction.schema.json',
    schema: PredictionDocumentSchema,
    title: 'KEIBA Prediction Import Document v1',
  },
  {
    fileName: 'result.schema.json',
    id: 'https://kento08-coder.github.io/KEIBA/schemas/result.schema.json',
    schema: ResultDocumentSchema,
    title: 'KEIBA Result Import Document v1',
  },
]

await mkdir(outputDirectory, { recursive: true })

for (const entry of schemas) {
  const jsonSchema = z.toJSONSchema(entry.schema, {
    target: 'draft-2020-12',
    unrepresentable: 'any',
  })
  const output = {
    $id: entry.id,
    title: entry.title,
    ...jsonSchema,
  }

  await writeFile(
    path.join(outputDirectory, entry.fileName),
    `${JSON.stringify(output, null, 2)}\n`,
    'utf8',
  )
}

console.log(`Generated ${schemas.length} JSON Schemas in ${outputDirectory}`)
