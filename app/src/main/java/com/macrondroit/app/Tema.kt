package com.macrondroit.app

import android.content.Context
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** Abu-abu kebiruan lembut (seperti slate di Tailwind). */
object Slate {
    val s900 = Color(0xFF0F172A)
    val s600 = Color(0xFF475569)
    val s500 = Color(0xFF64748B)
    val s400 = Color(0xFF94A3B8)
    val s200 = Color(0xFFE2E8F0)
    val s100 = Color(0xFFF1F5F9)
}

/** Satu paket warna tema. Semua tema cerah dan berwarna. */
data class Palet(
    val id: String,
    val nama: String,
    val utama: Color,
    val kedua: Color,
    val latar: Color,
    val teksDiAtasUtama: Color = Color.White
)

val DaftarTema = listOf(
    Palet("mentari", "Mentari", Color(0xFFFF8A00), Color(0xFFFFC83D), Color(0xFFFFF6E5)),
    Palet("samudra", "Samudra", Color(0xFF0288D1), Color(0xFF26C6DA), Color(0xFFE8F7FD)),
    Palet("permen", "Permen", Color(0xFFE91E8C), Color(0xFFB388FF), Color(0xFFFFEEF7)),
    Palet("hutan", "Hutan", Color(0xFF2E9E4F), Color(0xFFB5E04A), Color(0xFFEEF9EA)),
    Palet("lavender", "Lavender", Color(0xFF7E57C2), Color(0xFFF48FB1), Color(0xFFF4EEFB)),
    Palet("semangka", "Semangka", Color(0xFFEF5350), Color(0xFF66BB6A), Color(0xFFFFF0EF))
)

@Composable
fun MacroTema(palet: Palet, isi: @Composable () -> Unit) {
    // Warna berpindah mulus saat tema diganti
    val anim = tween<Color>(durationMillis = 450)
    val utama by animateColorAsState(palet.utama, anim, label = "utama")
    val kedua by animateColorAsState(palet.kedua, anim, label = "kedua")
    val latar by animateColorAsState(palet.latar, anim, label = "latar")

    val skema = lightColorScheme(
        primary = utama,
        onPrimary = palet.teksDiAtasUtama,
        secondary = kedua,
        onSecondary = Slate.s900,
        background = latar,
        onBackground = Slate.s900,
        surface = Color.White,
        onSurface = Slate.s900,
        primaryContainer = utama.copy(alpha = 0.14f),
        onPrimaryContainer = Slate.s900,
        surfaceVariant = Slate.s100,
        onSurfaceVariant = Slate.s500,
        outline = Slate.s200
    )
    val tipografi = Typography(
        titleLarge = TextStyle(
            fontSize = 22.sp, lineHeight = 28.sp,
            fontWeight = FontWeight.Bold, letterSpacing = (-0.3).sp
        ),
        titleMedium = TextStyle(
            fontSize = 17.sp, lineHeight = 24.sp,
            fontWeight = FontWeight.SemiBold, letterSpacing = (-0.1).sp
        ),
        bodyMedium = TextStyle(fontSize = 14.sp, lineHeight = 21.sp),
        labelLarge = TextStyle(
            fontSize = 13.sp, lineHeight = 18.sp, fontWeight = FontWeight.SemiBold
        ),
        labelMedium = TextStyle(
            fontSize = 12.sp, lineHeight = 16.sp, fontWeight = FontWeight.Medium
        )
    )
    val bentuk = Shapes(
        small = RoundedCornerShape(16.dp),
        medium = RoundedCornerShape(22.dp),
        large = RoundedCornerShape(28.dp)
    )
    MaterialTheme(colorScheme = skema, typography = tipografi, shapes = bentuk, content = isi)
}

/** Menyimpan tema pilihan di HP (tanpa internet). */
class PenyimpanTema(context: Context) {
    private val sp = context.getSharedPreferences("macrondroit", Context.MODE_PRIVATE)

    fun baca(): String = sp.getString("tema", "mentari") ?: "mentari"

    fun simpan(id: String) {
        sp.edit().putString("tema", id).apply()
    }
}
