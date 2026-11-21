package com.macrondroit.app

import android.app.KeyguardManager
import android.os.Bundle
import androidx.activity.ComponentActivity

/**
 * Layar transparan yang hanya meminta Android membuka kunci layar jenis geser.
 * Kalau HP memakai PIN, pola, atau sidik jari, Android tetap meminta Anda membukanya sendiri.
 */
class AktivitasBuka : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val km = getSystemService(KeyguardManager::class.java)
        km.requestDismissKeyguard(this, object : KeyguardManager.KeyguardDismissCallback() {
            override fun onDismissSucceeded() {
                finish()
            }

            override fun onDismissCancelled() {
                finish()
            }

            override fun onDismissError() {
                finish()
            }
        })
    }
}
