import {z} from "zod";
export const configInput=z.object({scoring:z.enum(["classic","domination"]).default("classic"),mode:z.enum(["standard","free"]).default("standard"),collection:z.enum(["mixed","Nature","Mythical","Arcane","Undead","Constructs"]).default("mixed")}).strict();
const formatId=z.string().regex(/^[a-z0-9][a-z0-9_-]{0,79}$/).nullable();
export const deckDocument=z.object({name:z.string().trim().min(1).max(80),cards:z.array(z.string().min(1).max(80)).max(15),config:configInput,testingAccess:z.boolean().default(false),formatId:formatId.default(null)}).strict();
export const deckInput=deckDocument.extend({draft:z.boolean().default(false),formatId:formatId.optional(),revision:z.number().int().positive().optional(),workspaceRevision:z.number().int().min(0).optional()}).strict();
// Transient blank names are recoverable while typing; publication still needs a name.
export const workspaceDocument=deckDocument.extend({name:z.string().max(80)}).strict();
export const documentOf=(d:any)=>({name:d.name,cards:d.cards,config:{scoring:d.config.scoring,mode:d.config.mode,collection:d.config.collection},formatId:d.formatId??null,testingAccess:!!d.testingAccess});
