package com.momentsplanner.events

import com.android.billingclient.api.ProductDetails.RecurrenceMode

/** Only advertise terms this paywall can describe exactly: monthly, with an optional 3-day trial. */
internal object MonthlyOfferPolicy {
    data class Phase(val micros: Long, val price: String, val period: String, val recurrence: Int, val cycles: Int)

    fun supported(phases: List<Phase>): Boolean {
        val paid = phases.lastOrNull() ?: return false
        if (paid.micros <= 0 || paid.price.isBlank() || paid.period != "P1M" || paid.recurrence != RecurrenceMode.INFINITE_RECURRING) return false
        return phases.size == 1 || (phases.size == 2 && hasTrial(phases))
    }

    fun hasTrial(phases: List<Phase>): Boolean = phases.size == 2 &&
        phases.first().let { it.micros == 0L && it.period == "P3D" && it.recurrence == RecurrenceMode.FINITE_RECURRING && it.cycles == 1 }
}
