package to.holepunch.bare.kit.react;

import com.facebook.proguard.annotations.DoNotStrip;
import com.facebook.react.bridge.ReactApplicationContext;

/**
 * Exposes Android nativeLibraryDir for linked bare-pack addons (dlopen from APK lib dir).
 */
public class BareKitAppModule extends NativeBareKitAppSpec {
  public BareKitAppModule(ReactApplicationContext context) {
    super(context);
  }

  @Override
  @DoNotStrip
  public String getNativeLibraryDir() {
    return getReactApplicationContext().getApplicationInfo().nativeLibraryDir;
  }
}
