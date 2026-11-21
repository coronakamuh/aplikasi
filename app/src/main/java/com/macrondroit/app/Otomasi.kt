package com.macrondroit.app

import android.accessibilityservice.AccessibilityService
import android.annotation.SuppressLint
import android.app.AlarmManager
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import org.json.JSONArray
import org.json.JSONObject

object Aksi {
    const val SENYAP = 0
    const val SUARA_NORMAL = 1
    const val PESAWAT_ON = 2
    const val PESAWAT_OFF = 3
    const val BUKA_APP = 4

    fun nama(aksi: Int, namaApp: String): String = when (aksi) {
        SENYAP -> "Senyapkan HP"
        SUARA_NORMAL -> "Suara normal"
        PESAWAT_ON -> "Nyalakan mode pesawat"
        PESAWAT_OFF -> "Matikan mode pesawat"
        else -> if (namaApp.isBlank()) "Buka aplikasi" else "Buka $namaApp"
    }
}

/** Satu aturan otomatis: pada [waktu] (dan ulangannya) jalankan [aksi]. */
data class Aturan(
    val id: Int,
    val nama: String,
    val waktu: Long,
    val ulang: Int,
    val aksi: Int,
    val paket: String,
    val namaApp: String,
    val aktif: Boolean
)

private fun keJson(a: Aturan): JSONObject = JSONObject().apply {
    put("id", a.id)
    put("nama", a.nama)
    put("waktu", a.waktu)
    put("ulang", a.ulang)
    put("aksi", a.aksi)
    put("paket", a.paket)
    put("namaApp", a.namaApp)
    put("aktif", a.aktif)
}

private fun dariJson(o: JSONObject): Aturan = Aturan(
    id = o.getInt("id"),
    nama = o.optString("nama", ""),
    waktu = o.getLong("waktu"),
    ulang = o.optInt("ulang", Ulang.TIDAK),
    aksi = o.optInt("aksi", Aksi.SENYAP),
    paket = o.optString("paket", ""),
    namaApp = o.optString("namaApp", ""),
    aktif = o.optBoolean("aktif", true)
)

/** Penyimpanan aturan di HP. */
class GudangAturan(context: Context) {
    private val sp = context.applicationContext
        .getSharedPreferences("macrondroit", Context.MODE_PRIVATE)

    fun baca(): List<Aturan> {
        val teks = sp.getString("aturan", "[]") ?: "[]"
        return try {
            val arr = JSONArray(teks)
            (0 until arr.length()).map { dariJson(arr.getJSONObject(it)) }
        } catch (e: Exception) {
            emptyList()
        }
    }

    fun simpan(daftar: List<Aturan>) {
        val arr = JSONArray()
        daftar.forEach { arr.put(keJson(it)) }
        sp.edit().putString("aturan", arr.toString()).apply()
    }
}

/** Cek izin-izin khusus yang dibutuhkan otomatisasi. */
object Izin {
    fun dnd(c: Context): Boolean =
        c.getSystemService(NotificationManager::class.java).isNotificationPolicyAccessGranted

    fun overlay(c: Context): Boolean = Settings.canDrawOverlays(c)

    fun aksesibilitas(c: Context): Boolean {
        val daftar = Settings.Secure.getString(
            c.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
        ) ?: return false
        val kita = ComponentName(c, ServisPesawat::class.java)
        return daftar.split(':').mapNotNull { ComponentName.unflattenFromString(it) }.any { it == kita }
    }
}

/** Pusat data aturan untuk tampilan. */
class PusatOtomasi(context: Context) {
    private val app = context.applicationContext
    private val gudang = GudangAturan(app)

    val aturan = mutableStateListOf<Aturan>().apply { addAll(gudang.baca()) }

    var dndAman by mutableStateOf(Izin.dnd(app))
        private set
    var overlayAman by mutableStateOf(Izin.overlay(app))
        private set
    var aksesAman by mutableStateOf(Izin.aksesibilitas(app))
        private set

    fun segarkan() {
        aturan.clear()
        aturan.addAll(gudang.baca())
        dndAman = Izin.dnd(app)
        overlayAman = Izin.overlay(app)
        aksesAman = Izin.aksesibilitas(app)
    }

    fun simpan(a: Aturan) {
        val i = aturan.indexOfFirst { it.id == a.id }
        if (i >= 0) aturan[i] = a else aturan.add(a)
        gudang.simpan(aturan.toList())
        PenjadwalOtomatis.jadwalkan(app, a)
    }

    fun hapus(a: Aturan) {
        aturan.removeAll { it.id == a.id }
        gudang.simpan(aturan.toList())
        PenjadwalOtomatis.batalkan(app, a.id)
    }

    fun aktifkan(a: Aturan, aktif: Boolean) {
        simpan(a.copy(aktif = aktif))
    }
}

/** Memasang alarm untuk aturan otomatis (tanpa ikon alarm di bilah status). */
object PenjadwalOtomatis {
    private fun pi(c: Context, id: Int): PendingIntent = PendingIntent.getBroadcast(
        c,
        id + 4_000_000,
        Intent(c, OtomatisReceiver::class.java).putExtra("id", id),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

    fun jadwalkan(c: Context, a: Aturan) {
        val am = c.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        am.cancel(pi(c, a.id))
        if (!a.aktif) return
        val waktu = berikutDari(a.waktu, a.ulang, System.currentTimeMillis() + 1) ?: return
        val bisaPersis = Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms()
        if (bisaPersis) {
            am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, waktu, pi(c, a.id))
        } else {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, waktu, pi(c, a.id))
        }
    }

    fun batalkan(c: Context, id: Int) {
        val am = c.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        am.cancel(pi(c, id))
    }
}

/** Dipanggil sistem saat waktu aturan tiba. */
class OtomatisReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val id = intent.getIntExtra("id", -1)
        val gudang = GudangAturan(context)
        val daftar = gudang.baca()
        val a = daftar.firstOrNull { it.id == id } ?: return
        if (!a.aktif) return
        Pelaksana.jalankan(context, a)
        if (a.ulang == Ulang.TIDAK) {
            // aturan sekali jalan: matikan setelah dijalankan
            gudang.simpan(daftar.map { if (it.id == id) it.copy(aktif = false) else it })
        } else {
            PenjadwalOtomatis.jadwalkan(context, a)
        }
    }
}

/** Notifikasi kecil untuk memberi tahu hasil atau meminta ketukan. */
@SuppressLint("MissingPermission")
fun kabarOtomasi(c: Context, id: Int, judul: String, teks: String, ketuk: PendingIntent?) {
    Notif.siapkanKanal(c)
    val b = NotificationCompat.Builder(c, Notif.KANAL_NOTIF)
        .setSmallIcon(R.drawable.ic_notif)
        .setContentTitle(judul)
        .setContentText(teks)
        .setStyle(NotificationCompat.BigTextStyle().bigText(teks))
        .setPriority(NotificationCompat.PRIORITY_HIGH)
        .setAutoCancel(true)
    if (ketuk != null) b.setContentIntent(ketuk)
    NotificationManagerCompat.from(c).notify(id, b.build())
}

/** Menjalankan aksi sebuah aturan. Mengembalikan pesan hasil singkat. */
object Pelaksana {
    fun jalankan(c: Context, a: Aturan): String {
        val ctx = c.applicationContext
        return try {
            when (a.aksi) {
                Aksi.SENYAP -> senyap(ctx)
                Aksi.SUARA_NORMAL -> suaraNormal(ctx)
                Aksi.PESAWAT_ON -> pesawat(ctx, a, true)
                Aksi.PESAWAT_OFF -> pesawat(ctx, a, false)
                else -> bukaApp(ctx, a)
            }
        } catch (e: Exception) {
            "Gagal: ${e.message ?: "tidak diketahui"}"
        }
    }

    private fun senyap(c: Context): String {
        val am = c.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        return if (Izin.dnd(c)) {
            am.ringerMode = AudioManager.RINGER_MODE_SILENT
            "HP disenyapkan"
        } else {
            am.ringerMode = AudioManager.RINGER_MODE_VIBRATE
            "HP diatur ke getar. Beri izin Jangan Ganggu agar benar-benar senyap."
        }
    }

    private fun suaraNormal(c: Context): String {
        val am = c.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        am.ringerMode = AudioManager.RINGER_MODE_NORMAL
        return "Suara dikembalikan normal"
    }

    private fun pesawat(c: Context, a: Aturan, nyala: Boolean): String {
        val sekarang = Settings.Global.getInt(c.contentResolver, Settings.Global.AIRPLANE_MODE_ON, 0) == 1
        if (sekarang == nyala) {
            return "Mode pesawat sudah ${if (nyala) "menyala" else "mati"}"
        }
        val servis = ServisPesawat.instan
        if (servis == null) {
            val buka = PendingIntent.getActivity(
                c,
                a.id + 5_000_000,
                Intent(Settings.ACTION_AIRPLANE_MODE_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            kabarOtomasi(
                c, a.id + 5_000_000,
                "Mode pesawat belum bisa otomatis",
                "Nyalakan layanan aksesibilitas Macrondroit di tab Otomatis. Ketuk di sini untuk mengatur manual.",
                buka
            )
            return "Layanan aksesibilitas belum aktif, jadi mode pesawat tidak bisa diubah otomatis."
        }
        servis.ubahPesawat()
        return "Mengubah mode pesawat..."
    }

    private fun bukaApp(c: Context, a: Aturan): String {
        val intent = c.packageManager.getLaunchIntentForPackage(a.paket)
            ?: return "Aplikasi ${a.namaApp.ifBlank { a.paket }} tidak ditemukan"
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        return if (Izin.overlay(c)) {
            c.startActivity(intent)
            "Membuka ${a.namaApp}"
        } else {
            val pi = PendingIntent.getActivity(
                c, a.id + 5_000_000, intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            kabarOtomasi(
                c, a.id + 5_000_000,
                "Buka ${a.namaApp}",
                "Android menahan pembukaan otomatis. Ketuk di sini, atau beri izin Tampil di atas aplikasi lain.",
                pi
            )
            "Izin Tampil di atas aplikasi lain belum diberikan. Notifikasi dikirim sebagai gantinya."
        }
    }
}

/**
 * Layanan aksesibilitas milik Macrondroit. Hanya dipakai untuk membuka panel pengaturan cepat
 * dan menekan tombol Mode pesawat, lalu menutupnya lagi.
 */
class ServisPesawat : AccessibilityService() {
    companion object {
        @Volatile
        var instan: ServisPesawat? = null
    }

    private val handler = Handler(Looper.getMainLooper())

    override fun onServiceConnected() {
        instan = this
    }

    override fun onUnbind(intent: Intent?): Boolean {
        instan = null
        return super.onUnbind(intent)
    }

    override fun onDestroy() {
        instan = null
        super.onDestroy()
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {}

    override fun onInterrupt() {}

    fun ubahPesawat() {
        performGlobalAction(GLOBAL_ACTION_QUICK_SETTINGS)
        coba(0)
    }

    private fun coba(ke: Int) {
        handler.postDelayed({
            val akar = rootInActiveWindow
            val simpul = if (akar != null) cari(akar) else null
            if (simpul != null) {
                klik(simpul)
                handler.postDelayed({ performGlobalAction(GLOBAL_ACTION_BACK) }, 900)
            } else if (ke < 10) {
                coba(ke + 1)
            } else {
                performGlobalAction(GLOBAL_ACTION_BACK)
            }
        }, if (ke == 0) 900L else 500L)
    }

    private fun cari(n: AccessibilityNodeInfo): AccessibilityNodeInfo? {
        val teks = ((n.text?.toString() ?: "") + " " + (n.contentDescription?.toString() ?: "")).lowercase()
        if (teks.contains("pesawat") || teks.contains("airplane") || teks.contains("flight mode")) return n
        for (i in 0 until n.childCount) {
            val anak = n.getChild(i) ?: continue
            val hasil = cari(anak)
            if (hasil != null) return hasil
        }
        return null
    }

    private fun klik(n: AccessibilityNodeInfo) {
        var x: AccessibilityNodeInfo? = n
        while (x != null) {
            if (x.isClickable && x.performAction(AccessibilityNodeInfo.ACTION_CLICK)) return
            x = x.parent
        }
    }
}
