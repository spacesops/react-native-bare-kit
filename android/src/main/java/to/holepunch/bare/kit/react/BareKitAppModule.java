package to.holepunch.bare.kit.react;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.module.annotations.ReactModule;
import com.facebook.react.turbomodule.core.interfaces.TurboModule;
import java.util.HashMap;
import java.util.Map;

/**
 * Exposes Android nativeLibraryDir so linked bare-pack addons can be dlopen'd.
 */
@ReactModule(name = BareKitAppModule.NAME)
public class BareKitAppModule extends ReactContextBaseJavaModule implements TurboModule {
  public static final String NAME = "BareKitApp";

  BareKitAppModule(ReactApplicationContext context) {
    super(context);
  }

  @Override
  public String getName() {
    return NAME;
  }

  @Override
  public Map<String, Object> getConstants() {
    Map<String, Object> constants = new HashMap<>();
    constants.put(
      "nativeLibraryDir",
      getReactApplicationContext().getApplicationInfo().nativeLibraryDir
    );
    return constants;
  }
}
