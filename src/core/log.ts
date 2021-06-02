import { Disposable } from "../api/disposable";

export interface Log extends Disposable {
    info(msg: string): void;
    debug(msg: string): void;
    warn(msg: string): void;
    error(msg: string): void;
}