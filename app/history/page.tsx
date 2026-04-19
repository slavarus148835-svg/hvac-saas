"use client";

import CalculatorHistoryEmbed from "@/components/CalculatorHistoryEmbed";
import { withFeatureGuard } from "@/lib/withFeatureGuard";

export default withFeatureGuard(CalculatorHistoryEmbed, "history");
