import { SpecCompleteResponse } from "./spec-complete-response";

export interface KarmaEvent {
  
  readonly name: string;
  readonly results: SpecCompleteResponse;
}

