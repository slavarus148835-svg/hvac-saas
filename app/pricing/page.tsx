"use client";

import CalculatorPricingEmbed from "@/components/CalculatorPricingEmbed";
import { withFeatureGuard } from "@/lib/withFeatureGuard";

export default withFeatureGuard(CalculatorPricingEmbed, "pricing");
