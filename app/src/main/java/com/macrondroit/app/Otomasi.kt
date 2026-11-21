package com.macrondroit.app

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.annotation.SuppressLint
import android.app.AlarmManager
import android.app.KeyguardManager
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Path
import android.graphics.Rect
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
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

/** Catatan hasil aksi terakhir, supaya terlihat kenapa sebuah aksi berhasil atau gagal. */
object Catatan {
    private fun sp(c: Context) =
        c.applicationContext.getSharedPreferences("macrondroit", Context.MODE_PRIVATE)

    fun simpan(c: Context, pesan: String) {
        val jam = java.time.LocalTime.now().format(java.time.format.DateTimeFormatter.ofPattern("HH:mm"))
        sp(c).edit().putString("catatan", "$jam · $pesan").apply()
    }

    fun baca(c: Context): String = sp(c).getString("catatan", "") ?: ""
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
    var catatan by mutableStateOf(Catatan.baca(app))
        private set

    fun segarkan() {
        aturan.clear()
        aturan.addAll(gudang.baca())
        dndAman = Izin.dnd(app)
        overlayAman = Izin.overlay(app)
        aksesAman = Izin.aksesibilitas(app)
        catatan = Catatan.baca(app)
    }

    fun segarkanCatatan() {
        catatan = Catatan.baca(app)
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
        val hasil = try {
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
        Catatan.simpan(ctx, Aksi.nama(a.aksi, a.namaApp) + " → " + hasil)
        return hasil
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
        servis.ubahPesawat(nyala)
        return "Sedang menekan tombol Mode pesawat, hasilnya muncul di catatan."
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

    /** Mengubah mode pesawat ke [nyala]. Layar dinyalakan dulu bila sedang mati. */
    @Suppress("DEPRECATION")
    fun ubahPesawat(nyala: Boolean) {
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        val layarMati = !pm.isInteractive
        val wl = pm.newWakeLock(
            PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP,
            "macrondroit:pesawat"
        )
        wl.acquire(40_000L)

        val km = getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
        val terkunci = km.isKeyguardLocked
        if (terkunci) {
            // Berhasil bila kunci layar hanya jenis geser. PIN atau pola tetap harus dibuka sendiri.
            try {
                startActivity(Intent(this, AktivitasBuka::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            } catch (e: Exception) {
                // diabaikan, dicatat di hasil akhir bila tombol tidak ditemukan
            }
        }
        handler.postDelayed({
            performGlobalAction(GLOBAL_ACTION_QUICK_SETTINGS)
            coba(0, nyala, layarMati, terkunci, wl)
        }, if (terkunci) 2200L else 900L)
    }

    private fun coba(ke: Int, nyala: Boolean, layarMati: Boolean, terkunci: Boolean, wl: PowerManager.WakeLock) {
        handler.postDelayed({
            val simpul = temukan()
            if (simpul != null && (simpul.isVisibleToUser || ke >= 8)) {
                val cara = klik(simpul)
                val info = infoSimpul(simpul)
                handler.postDelayed({
                    selesai(
                        nyala, layarMati, wl,
                        if (cara != null) "Tombol Mode pesawat ditekan lewat $cara ($info)."
                        else "Tombol ditemukan tetapi tidak bisa ditekan ($info)."
                    )
                }, 1600)
            } else if (ke < 12) {
                coba(ke + 1, nyala, layarMati, terkunci, wl)
            } else {
                val contoh = mutableListOf<String>()
                try {
                    windows.forEach { w -> w.root?.let { kumpulTeks(it, contoh) } }
                } catch (e: Exception) {
                    // abaikan
                }
                val sebab = if (terkunci) "Layar terkunci, kemungkinan memakai PIN atau pola. " else ""
                selesai(
                    nyala, layarMati, wl,
                    sebab + "Tombol Mode pesawat tidak ditemukan. Isi layar yang terbaca: " +
                        (if (contoh.isEmpty()) "kosong" else contoh.joinToString(", "))
                )
            }
        }, if (ke == 0) 1000L else 500L)
    }

    private fun selesai(nyala: Boolean, layarMati: Boolean, wl: PowerManager.WakeLock, pesan: String) {
        val sekarang = Settings.Global.getInt(contentResolver, Settings.Global.AIRPLANE_MODE_ON, 0) == 1
        val hasil = if (sekarang == nyala) {
            "Berhasil, mode pesawat ${if (nyala) "menyala" else "mati"}."
        } else {
            "Belum berubah. $pesan"
        }
        Catatan.simpan(this, "Mode pesawat → $hasil")
        if (sekarang != nyala) {
            kabarOtomasi(this, 7_000_000, "Mode pesawat belum berubah", hasil, null)
        }
        performGlobalAction(GLOBAL_ACTION_BACK)
        handler.postDelayed({
            if (layarMati && Build.VERSION.SDK_INT >= 28) performGlobalAction(GLOBAL_ACTION_LOCK_SCREEN)
            if (wl.isHeld) wl.release()
        }, 1200)
    }

    private fun temukan(): AccessibilityNodeInfo? {
        val akar = mutableListOf<AccessibilityNodeInfo>()
        try {
            windows.forEach { w -> w.root?.let { akar.add(it) } }
        } catch (e: Exception) {
            // abaikan
        }
        rootInActiveWindow?.let { akar.add(it) }
        val cocok = mutableListOf<AccessibilityNodeInfo>()
        for (a in akar) kumpulCocok(a, cocok)
        return cocok.firstOrNull { it.isVisibleToUser && adaUkuran(it) } ?: cocok.firstOrNull()
    }

    private fun kumpulCocok(n: AccessibilityNodeInfo, hasil: MutableList<AccessibilityNodeInfo>) {
        val teks = ((n.text?.toString() ?: "") + " " + (n.contentDescription?.toString() ?: "")).lowercase()
        if (teks.contains("pesawat") || teks.contains("airplane") || teks.contains("flight mode")) hasil.add(n)
        for (i in 0 until n.childCount) {
            val anak = n.getChild(i) ?: continue
            kumpulCocok(anak, hasil)
        }
    }

    private fun adaUkuran(n: AccessibilityNodeInfo): Boolean {
        val r = Rect()
        n.getBoundsInScreen(r)
        return !r.isEmpty
    }

    private fun infoSimpul(n: AccessibilityNodeInfo): String {
        val r = Rect()
        n.getBoundsInScreen(r)
        return "terlihat=${n.isVisibleToUser}, kotak=${r.flattenToString()}"
    }

    /** Mengembalikan nama cara yang berhasil, atau null bila semua cara gagal. */
    private fun klik(n: AccessibilityNodeInfo): String? {
        var x: AccessibilityNodeInfo? = n
        while (x != null) {
            if (x.isClickable && x.performAction(AccessibilityNodeInfo.ACTION_CLICK)) return "klik biasa"
            x = x.parent
        }
        // Cadangan: ketuk layar langsung di tengah tombol (seperti jari). Pilih wadah tombol
        // yang cukup besar, bukan hanya tulisan kecilnya.
        var sasaran: Rect? = null
        x = n
        while (x != null) {
            val r = Rect()
            x.getBoundsInScreen(r)
            if (!r.isEmpty && r.width() >= 120 && r.height() >= 120) {
                sasaran = r
                break
            }
            x = x.parent
        }
        if (sasaran == null) {
            val r = Rect()
            n.getBoundsInScreen(r)
            if (!r.isEmpty) sasaran = r
        }
        if (sasaran != null) {
            val jalur = Path().apply { moveTo(sasaran.exactCenterX(), sasaran.exactCenterY()) }
            val gerak = GestureDescription.Builder()
                .addStroke(GestureDescription.StrokeDescription(jalur, 0L, 80L))
                .build()
            if (dispatchGesture(gerak, null, null)) {
                return "ketukan layar di (${sasaran.centerX()}, ${sasaran.centerY()})"
            }
        }
        return null
    }

    private fun kumpulTeks(n: AccessibilityNodeInfo, hasil: MutableList<String>) {
        if (hasil.size >= 14) return
        val t = (n.text?.toString() ?: n.contentDescription?.toString() ?: "").trim()
        if (t.isNotEmpty() && t !in hasil) hasil.add(t.take(30))
        for (i in 0 until n.childCount) {
            val anak = n.getChild(i) ?: continue
            kumpulTeks(anak, hasil)
        }
    }
}
