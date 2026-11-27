import {registerConfiguration} from "./configuration";
import {tradingSchema,DEFAULT_TRADING} from "./trading-rules";
export function registerTradingPublication(){registerConfiguration("trading",value=>tradingSchema.parse(value),DEFAULT_TRADING);}
