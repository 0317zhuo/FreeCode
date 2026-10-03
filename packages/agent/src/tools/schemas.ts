import { bashDefinition } from "./bash/schema";
import { createFileDefinition } from "./create-file/schema";
import { editFileDefinition } from "./edit-file/schema";
import { listDirectoryDefinition } from "./list-directory/schema";
import { readFileDefinition } from "./read-file/schema";
import { searchFilesDefinition } from "./search-files/schema";

export const toolSchemas = {
  listDirectory: listDirectoryDefinition,
  readFile: readFileDefinition,
  searchFiles: searchFilesDefinition,
  createFile: createFileDefinition,
  editFile: editFileDefinition,
  bash: bashDefinition,
};

export type CodingToolName = keyof typeof toolSchemas;
