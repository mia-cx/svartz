import type { Schema } from "effect";
import type {
  CustomDomainRouteSchema,
  ZoneIdRouteSchema,
  ZoneNameRouteSchema,
  WranglerAssetsSchema,
  WranglerBuildSchema,
  WranglerConfigFieldsSchema,
  WranglerConfigSchema,
  WranglerEnvRecordSchema,
  WranglerLimitsSchema,
  WranglerObservabilitySchema,
  WranglerPlacementSchema,
  WranglerRouteSchema,
  WranglerTriggersSchema,
} from "./schema";

type CustomDomainRoute = Schema.Schema.Type<typeof CustomDomainRouteSchema>;
type WranglerAssets = Schema.Schema.Type<typeof WranglerAssetsSchema>;
type WranglerBuild = Schema.Schema.Type<typeof WranglerBuildSchema>;
type WranglerConfig = Schema.Schema.Type<typeof WranglerConfigSchema>;
type WranglerConfigFields = Schema.Schema.Type<
  typeof WranglerConfigFieldsSchema
>;
type WranglerEnvRecord = Schema.Schema.Type<typeof WranglerEnvRecordSchema>;
type WranglerLimits = Schema.Schema.Type<typeof WranglerLimitsSchema>;
type WranglerObservability = Schema.Schema.Type<
  typeof WranglerObservabilitySchema
>;
type WranglerPlacement = Schema.Schema.Type<typeof WranglerPlacementSchema>;
type WranglerRoute = Schema.Schema.Type<typeof WranglerRouteSchema>;
type WranglerTriggers = Schema.Schema.Type<typeof WranglerTriggersSchema>;
type ZoneIdRoute = Schema.Schema.Type<typeof ZoneIdRouteSchema>;
type ZoneNameRoute = Schema.Schema.Type<typeof ZoneNameRouteSchema>;

export {
  type CustomDomainRoute,
  type WranglerAssets,
  type WranglerBuild,
  type WranglerConfig,
  type WranglerConfigFields,
  type WranglerEnvRecord,
  type WranglerLimits,
  type WranglerObservability,
  type WranglerPlacement,
  type WranglerRoute,
  type WranglerTriggers,
  type ZoneIdRoute,
  type ZoneNameRoute,
};
