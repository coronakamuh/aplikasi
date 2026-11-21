package com.macrondroit.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val penyimpan = PenyimpanTema(applicationContext)
        setContent {
            var temaId by remember { mutableStateOf(penyimpan.baca()) }
            val palet = DaftarTema.firstOrNull { it.id == temaId } ?: DaftarTema[0]
            MacroTema(palet) {
                AplikasiUtama(
                    temaId = temaId,
                    onPilihTema = {
                        temaId = it
                        penyimpan.simpan(it)
                    }
                )
            }
        }
    }
}
