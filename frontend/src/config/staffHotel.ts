export interface StaffHotelConfig {
  floorSuffixLength: number;
}

export const staffHotelConfig: StaffHotelConfig = {
  // Room format examples:
  // 305  -> floor 3
  // 1012 -> floor 10
  floorSuffixLength: 2,
};

