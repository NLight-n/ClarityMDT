-- AlterTable
ALTER TABLE "Case" ADD COLUMN "clinicalDetails_new" JSONB;

-- Convert existing string data to JSON format (wrapping in a paragraph node)
UPDATE "Case" 
SET "clinicalDetails_new" = jsonb_build_object(
  'type', 'doc',
  'content', jsonb_build_array(
    jsonb_build_object(
      'type', 'paragraph',
      'content', CASE 
        WHEN "clinicalDetails" IS NULL OR "clinicalDetails" = '' THEN jsonb_build_array()
        ELSE jsonb_build_array(
          jsonb_build_object('type', 'text', 'text', "clinicalDetails")
        )
      END
    )
  )
)
WHERE "clinicalDetails_new" IS NULL;

-- Make the new column NOT NULL (after data migration)
ALTER TABLE "Case" ALTER COLUMN "clinicalDetails_new" SET NOT NULL;

-- Drop the old column
ALTER TABLE "Case" DROP COLUMN "clinicalDetails";

-- Rename the new column to the original name
ALTER TABLE "Case" RENAME COLUMN "clinicalDetails_new" TO "clinicalDetails";
