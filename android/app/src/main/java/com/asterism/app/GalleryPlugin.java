package com.asterism.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ContentResolver;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.media.ExifInterface;
import android.net.Uri;
import android.provider.MediaStore;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;

/**
 * 从系统相册选一张图。用 ACTION_PICK 直接打开相册（小米相册等），
 * 不走谷歌的照片选择器——国内系统没有它时会退回成文件管理器。
 * 图片在这里压缩到长边 1600 像素、按 EXIF 摆正，再以 JPEG dataURL 交给网页。
 */
@CapacitorPlugin(name = "Gallery")
public class GalleryPlugin extends Plugin {

    private static final int MAX_SIDE = 1600;

    @PluginMethod
    public void pick(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_PICK);
        intent.setDataAndType(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, "image/*");
        try {
            startActivityForResult(call, intent, "onPicked");
        } catch (ActivityNotFoundException e) {
            // 没有相册应用时退回到系统的“选择文件”
            Intent fallback = new Intent(Intent.ACTION_GET_CONTENT);
            fallback.setType("image/*");
            fallback.addCategory(Intent.CATEGORY_OPENABLE);
            startActivityForResult(call, fallback, "onPicked");
        }
    }

    @ActivityCallback
    private void onPicked(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
            JSObject ret = new JSObject();
            ret.put("cancelled", true);
            call.resolve(ret);
            return;
        }
        Uri uri = data.getData();
        new Thread(() -> {
            try {
                call.resolve(load(uri));
            } catch (Exception e) {
                call.reject("图片读取失败：" + e.getMessage());
            }
        }).start();
    }

    private JSObject load(Uri uri) throws Exception {
        ContentResolver cr = getContext().getContentResolver();

        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        try (InputStream in = cr.openInputStream(uri)) {
            BitmapFactory.decodeStream(in, null, bounds);
        }
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) throw new Exception("不是图片");

        // 先按 2 的倍数粗缩，省内存
        int sample = 1;
        while (Math.max(bounds.outWidth, bounds.outHeight) / (sample * 2) >= MAX_SIDE) sample *= 2;
        BitmapFactory.Options opts = new BitmapFactory.Options();
        opts.inSampleSize = sample;
        Bitmap src;
        try (InputStream in = cr.openInputStream(uri)) {
            src = BitmapFactory.decodeStream(in, null, opts);
        }
        if (src == null) throw new Exception("解码失败");

        int rotate = 0;
        try (InputStream in = cr.openInputStream(uri)) {
            int o = new ExifInterface(in).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL);
            if (o == ExifInterface.ORIENTATION_ROTATE_90) rotate = 90;
            else if (o == ExifInterface.ORIENTATION_ROTATE_180) rotate = 180;
            else if (o == ExifInterface.ORIENTATION_ROTATE_270) rotate = 270;
        } catch (Exception ignored) {}

        float k = Math.min(1f, MAX_SIDE / (float) Math.max(src.getWidth(), src.getHeight()));
        Matrix m = new Matrix();
        m.postScale(k, k);
        m.postRotate(rotate);
        Bitmap out = Bitmap.createBitmap(src, 0, 0, src.getWidth(), src.getHeight(), m, true);

        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        out.compress(Bitmap.CompressFormat.JPEG, 85, bos);
        JSObject ret = new JSObject();
        ret.put("dataUrl", "data:image/jpeg;base64," + Base64.encodeToString(bos.toByteArray(), Base64.NO_WRAP));
        ret.put("ratio", out.getHeight() / (double) out.getWidth());
        if (out != src) out.recycle();
        src.recycle();
        return ret;
    }
}
