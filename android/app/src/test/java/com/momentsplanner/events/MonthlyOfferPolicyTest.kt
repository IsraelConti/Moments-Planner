package com.momentsplanner.events

import org.junit.Assert.*
import org.junit.Test

class MonthlyOfferPolicyTest {
    private val monthly = MonthlyOfferPolicy.Phase(4990000, "4,99 €", "P1M", 1, 0)
    private val trial = MonthlyOfferPolicy.Phase(0, "Gratis", "P3D", 2, 1)

    @Test fun recurringMonthlyPlanIsSupportedWithoutClaimingATrial() {
        assertTrue(MonthlyOfferPolicy.supported(listOf(monthly)))
        assertFalse(MonthlyOfferPolicy.hasTrial(listOf(monthly)))
    }
    @Test fun threeDayTrialFollowedByMonthlyPaymentIsSupported() {
        assertTrue(MonthlyOfferPolicy.supported(listOf(trial, monthly)))
        assertTrue(MonthlyOfferPolicy.hasTrial(listOf(trial, monthly)))
    }
    @Test fun localizedCurrenciesAreAcceptedWithoutReformatting() {
        for (price in listOf("US$5.49", "£4.49", "MX$109.00", "4,99 €")) {
            assertTrue(MonthlyOfferPolicy.supported(listOf(monthly.copy(price = price))))
        }
    }
    @Test fun annualAndWeeklyPlansCannotBeAdvertisedAsMonthly() {
        for (period in listOf("P1Y", "P1W", "P3M")) {
            assertFalse(MonthlyOfferPolicy.supported(listOf(monthly.copy(period = period))))
        }
    }
    @Test fun finiteAndPrepaidPlansCannotBeAdvertisedAsAutoRenewing() {
        for (mode in listOf(2, 3)) {
            assertFalse(MonthlyOfferPolicy.supported(listOf(monthly.copy(recurrence = mode))))
        }
    }
    @Test fun undisclosedIntroductoryDiscountsAndOtherTrialDurationsAreRejected() {
        assertFalse(MonthlyOfferPolicy.supported(listOf(monthly.copy(micros = 990000), monthly)))
        assertFalse(MonthlyOfferPolicy.supported(listOf(trial.copy(period = "P7D"), monthly)))
        assertFalse(MonthlyOfferPolicy.supported(listOf(trial.copy(cycles = 2), monthly)))
        assertFalse(MonthlyOfferPolicy.supported(listOf(trial, monthly, monthly)))
    }
    @Test fun missingOrFreeFinalPricesCannotStartACheckout() {
        assertFalse(MonthlyOfferPolicy.supported(emptyList()))
        assertFalse(MonthlyOfferPolicy.supported(listOf(monthly.copy(price = ""))))
        assertFalse(MonthlyOfferPolicy.supported(listOf(monthly.copy(micros = 0))))
    }
}
