// @ts-nocheck
import { type VariableStoreSerializer } from '../variableStore.js';
import { type Keyboard } from './keyboard.js';

export interface KeyboardMinimalInterface {
  activeKeyboard: Keyboard;
  variableStoreSerializer: VariableStoreSerializer;

}